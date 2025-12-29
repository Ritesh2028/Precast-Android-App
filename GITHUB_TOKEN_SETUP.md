# GitHub Token Setup Guide

## Step-by-Step Instructions

### 1. Create a Personal Access Token

1. Go to GitHub: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Fill in the form:
   - **Note:** `Precast App Push`
   - **Expiration:** Choose your preference (30 days, 90 days, or No expiration)
   - **Select scopes:** ✅ Check **`repo`** (this gives full repository access)
4. Click **"Generate token"** at the bottom
5. **IMPORTANT:** Copy the token immediately! You won't be able to see it again.

### 2. Use the Token to Push

**Option 1: Pass token as argument**
```bash
./push-with-token.sh YOUR_NEW_TOKEN_HERE
```

**Option 2: Use environment variable**
```bash
TOKEN=YOUR_NEW_TOKEN_HERE ./push-with-token.sh
```

**Option 3: With custom commit message**
```bash
./push-with-token.sh YOUR_NEW_TOKEN_HERE "Your commit message"
```

### 3. Security Notes

- ⚠️ **Never commit tokens to git**
- ⚠️ **Don't share tokens publicly**
- ✅ The script automatically removes the token from git config after pushing
- ✅ Consider using SSH keys for better security (optional)

### 4. Troubleshooting

**Error: "Permission denied"**
- Make sure your token has the `repo` scope enabled
- Verify the token hasn't expired

**Error: "Repository not found"**
- Check that the repository exists: https://github.com/Ritesh2028/Precast-Android-App
- Verify you have access to the repository

**Error: "Authentication failed"**
- The token might be invalid or expired
- Create a new token and try again

