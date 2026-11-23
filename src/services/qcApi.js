/**
 * QC data used by the mobile QC features. All calls go through the shared axios
 * client (auth header + 401 refresh). Response shapes mirror the Go handlers:
 *  - rectification      internal/handler/production/RectificationHandler.go
 *  - answers            internal/handler/production/QuestionHandler.go (GetAnswers)
 *  - element timeline   internal/handler/dashboard/dashboard_element_timeline.go
 *  - task journey       internal/handler/dashboard/dashboard_task_journey.go
 *  - qc stagewise       internal/handler/dashboard/dashboard_qc_reports.go
 *  - rejections         internal/handler/dashboard/dashboard_command.go
 */
import api from './apiClient';
import { getTokens } from './tokenManager';
import { API_BASE_URL } from '../config/apiConfig';

const asArray = (v) => (Array.isArray(v) ? v : []);

/** Human message for a failed request (server message when it sent one). */
export const qcErrorMessage = (err, fallback = 'Please check your connection and try again.') => {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const serverMsg = typeof data === 'string' ? data : data?.error || data?.message;
  if (serverMsg) return String(serverMsg);
  if (status === 403) return 'You do not have access to this project.';
  if (status) return `Request failed (${status}).`;
  return fallback;
};

// ---------- Rectification ----------

/** Elements on quality hold for a project: [{ id, element_id, element_name, status_text, ... }]. */
export const fetchRectification = async (projectId) => {
  const res = await api.get(`/api/rectification/${projectId}`);
  return asArray(res.data);
};

/**
 * Approve or reject one element's rectification.
 * status: 'Approved' releases the element; 'Rejected' makes the server archive the
 * element and re-create it with a new ID (it goes back through production).
 */
export const updateRectification = async ({ elementId, projectId, status, comments, image }) => {
  const res = await api.put('/api/update_rectification', [
    {
      element_id: Number(elementId),
      project_id: Number(projectId),
      status,
      comments: comments || '',
      image: image || '',
    },
  ]);
  return res.data;
};

/** Uploads a photo via /api/upload and returns the stored file name. */
export const uploadPhoto = async ({ uri, type = 'image/jpeg', name, projectId }) => {
  const { accessToken } = await getTokens();
  const form = new FormData();
  form.append('file', { uri, type, name: name || `photo_${Date.now()}.jpg` });
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
  const res = await fetch(`${API_BASE_URL}/api/upload${query}`, {
    method: 'POST',
    headers: { Authorization: accessToken || '' },
    body: form,
  });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status}).`);
  const data = await res.json().catch(() => ({}));
  const fileName = data.file_name;
  if (!fileName) throw new Error('Photo upload returned no file name.');
  return fileName;
};

// ---------- QC report (per element, all stages) ----------

const normStage = (v) => String(v || '').replace(/^stage:\s*/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** True when two stage names refer to the same stage ("Stage: Pre Pour" ~ "pre_pour"). */
export const sameStage = (a, b) => !!a && !!b && normStage(a) === normStage(b);

/**
 * QC report for one element, built from /api/scan_element/:id lifecycle — the same
 * source the web Element page uses. qc_answers are keyed by element, so this
 * finds every stage's checklist. Answers come from the latest QC log entry for
 * the stage when it has them (those include comments), else the stage answers.
 * Returns { elementCode, stages: [{ name, qcAt, qcUser, answers, history }] }.
 */
export const fetchElementQcReport = async (elementId) => {
  const res = await api.get(`/api/scan_element/${elementId}`);
  const data = res.data || {};
  const lifecycle = asArray(data.lifecycle || data.life_cycle);
  const stages = lifecycle
    .filter((ev) => /^stage:/i.test(String(ev?.label || '')))
    .map((ev) => {
      const logs = asArray(ev.logs).slice().sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
      const latestWithAnswers = logs.find((l) => asArray(l.answers).length > 0);
      const answers = latestWithAnswers ? asArray(latestWithAnswers.answers) : asArray(ev.answers);
      return {
        name: String(ev.label).replace(/^stage:\s*/i, ''),
        qcAt: ev.qc_timestamp || latestWithAnswers?.created_at || answers[0]?.created_at || null,
        qcUser: ev.qc_user_name || latestWithAnswers?.actor_name || answers[0]?.qc_name || ev.qc_assignee_name || '',
        answers,
        history: logs.map((l) => ({
          at: l.created_at,
          actor: l.actor_name || '',
          from: l.from_status || '',
          to: l.to_status || '',
          event: l.event_type || '',
        })),
      };
    })
    .filter((st) => st.answers.length > 0 || st.history.length > 0 || st.qcAt);
  return { elementCode: data.element_id || '', stages };
};

/** Image source for a stored file (uploaded photo / QC image) with auth header. */
export const fileImageSource = async (fileName) => {
  const { accessToken } = await getTokens();
  return {
    uri: `${API_BASE_URL}/api/get-file?file=${encodeURIComponent(fileName)}`,
    headers: { Authorization: accessToken || '' },
  };
};

// ---------- Element timeline ----------

/** { element_name, element_code, steps: [{key,label,at,user_name,detail,done}], qc: [{stage,status,at,user_name}] } */
export const fetchElementTimeline = async (elementId) => {
  const res = await api.get(`/api/dashboard/element_timeline/${elementId}`);
  const d = res.data || {};
  return { ...d, steps: asArray(d.steps), qc: asArray(d.qc) };
};

// ---------- Delays (task journey) ----------

/**
 * Map of element id -> { delayDays, timeStatus, currentStep } for one project.
 * Built from /api/dashboard/task_journey/:project_id.
 */
export const fetchElementDelays = async (projectId) => {
  const res = await api.get(`/api/dashboard/task_journey/${projectId}`);
  const map = {};
  asArray(res.data?.tasks).forEach((task) => {
    asArray(task.elements).forEach((el) => {
      if (!el?.element_id) return;
      const delayDays = Math.max(Number(el.delay_days) || 0, 0);
      const prev = map[el.element_id];
      if (!prev || delayDays > prev.delayDays) {
        map[el.element_id] = {
          delayDays,
          timeStatus: task.time_status,
          currentStep: el.current_step || el.stage_name || '',
        };
      }
    });
  });
  return map;
};

/** Delays for several projects at once (failures for one project are skipped). */
export const fetchDelaysForProjects = async (projectIds) => {
  const ids = [...new Set(projectIds.filter(Boolean).map(String))];
  const results = await Promise.allSettled(ids.map((id) => fetchElementDelays(id)));
  return results.reduce((acc, r) => (r.status === 'fulfilled' ? { ...acc, ...r.value } : acc), {});
};

// ---------- QC dashboard ----------

/** [{ stage, approved, pending }] for the current year, in project stage order. */
export const fetchQcStagewise = async (projectId) => {
  const year = new Date().getFullYear();
  const res = await api.get(`/api/qc_reports_stagewise/${projectId}`, { params: { type: 'yearly', year } });
  const rows = asArray(res.data?.data);
  const order = [];
  const byStage = {};
  rows.forEach((r) => {
    if (!byStage[r.stage]) {
      byStage[r.stage] = { stage: r.stage, approved: 0, pending: 0 };
      order.push(r.stage);
    }
    if (r.status === 'approved' || r.status === 'pending') byStage[r.stage][r.status] = Number(r.count) || 0;
  });
  return order.map((s) => byStage[s]);
};

/** { total, weekly: [{week,count}], stages: [{stage,count,share}] } for the last 6 weeks. */
export const fetchRejections = async (projectId) => {
  const res = await api.get('/api/rejections_breakdown', {
    params: projectId ? { project_id: projectId } : undefined,
  });
  const d = res.data || {};
  return { total: Number(d.total) || 0, weekly: asArray(d.weekly), stages: asArray(d.stages) };
};
