# GITHUB PAT TOKEN CREATION GUIDE

**Purpose:** Generate a token so Hermes can push code to GitHub and create PRs

**Time:** 5 minutes

---

## 🔑 **STEP-BY-STEP**

### Step 1: Go to GitHub Settings
```
URL: https://github.com/settings/tokens
```

**Or manually:**
1. Click your profile icon (top right)
2. Click "Settings"
3. Click "Developer settings" (bottom left)
4. Click "Personal access tokens"
5. Click "Tokens (classic)"

---

### Step 2: Create New Token
Click: **"Generate new token"** → **"Generate new token (classic)"**

---

### Step 3: Configure Token Settings

**Token name:**
```
Hermes-Neuro-MRI-Deploy
```

**Expiration:**
- Default: 7 days ✓
- Or: 30 days (if you want longer)
- Or: No expiration (not recommended)

**Scopes (checkboxes to check):**
- ✅ `repo` — Full control of private and public repositories
- ✅ `workflow` — Update GitHub Actions workflows
- (Leave others unchecked)

---

### Step 4: Generate Token
Click: **"Generate token"**

---

### Step 5: Copy & Save Token
**Important:** GitHub only shows the token ONCE!

1. Click the copy button (clipboard icon)
2. Token format: `github_pat_1A2B3C4D5E6F...`
3. Save it somewhere safe (or send directly to me)

---

## ⚠️ **SECURITY**

- ✅ Token will be used only to push code
- ✅ Token will NOT be saved anywhere
- ✅ Token expires after 7 days
- ✅ You can revoke it anytime at settings/tokens

---

## 📤 **SEND TOKEN TO ME**

**Send via Telegram:**
```
github_pat_1A2B3C4D5E6F...
```

**I will then:**
1. Use token to authenticate with GitHub
2. Push branch to origin
3. Create PR
4. Monitor CI
5. Merge when green
6. Deploy

---

## 🚀 **WHAT HAPPENS NEXT**

**After you send token:**

```
<1 min:  Authenticate with GitHub
<5 min:  Push branch to origin
<10 min: Create PR (Hermes will auto-comment with details)
<15 min: Wait for CI to pass
<20 min: Merge to main
<25 min: Deploy
<30 min: Page visible at /biomarkers
```

---

## ✅ **VERIFICATION**

After deploy, page will show:
- URL: `https://yoursite.com/biomarkers`
- Tab: "MRI Neuromarkers" (second tab)
- Cards: 18 MRI signs with search/filter

---

**Create token at: https://github.com/settings/tokens**
