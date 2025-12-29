# 🔑 GitHub Token Setup (New Interface)

## Step-by-Step Instructions

### 1. Repository Access
Select one of these options:
- ✅ **"All repositories"** (Recommended - applies to all current and future repos)
- OR
- ✅ **"Only select repositories"** → Then select "Precast-Android-App"

### 2. Permissions (IMPORTANT!)
Click on **"Permissions"** section to expand it.

Under **"Repository permissions"**, you need:

- ✅ **Contents** → Set to **"Read and write"** (or "Write")
- ✅ **Metadata** → Set to **"Read-only"** (usually auto-selected)

**Why:** The "Contents" permission with "Read and write" access allows you to push code.

### 3. Generate Token
1. Scroll down
2. Click **"Generate token"** (green button)
3. **IMMEDIATELY COPY THE TOKEN** - you won't see it again!

### 4. Use the Token
Once you have the new token, run:
```bash
./push-with-token.sh YOUR_NEW_TOKEN_HERE
```

---

## ⚠️ Common Mistakes

❌ **Don't** just select "Public repositories" - this is read-only
✅ **Do** select "All repositories" or select your specific repo
✅ **Do** set "Contents" permission to "Read and write"

## 🔒 Security
- Never share your token
- Never commit tokens to git
- The script automatically removes token after pushing

