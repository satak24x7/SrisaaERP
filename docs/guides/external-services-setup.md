# External Services Setup Guide

This guide covers configuring external services used by the GovProjects Platform.

---

## 1. Google Gemini AI (RFP Analysis + Email Assistant)

Gemini AI powers two features:
- **AI RFP Analysis** — Analyzes tender documents and extracts structured bid decision data
- **AI Email Assistant** — Summarizes emails and drafts replies

### Steps

1. **Get a Gemini API Key**
   - Go to [Google AI Studio](https://aistudio.google.com/apikey)
   - Sign in with your Google account
   - Click **Create API Key**
   - Copy the key

2. **Configure in the App**
   - Navigate to **System → Configuration**
   - Under **AI Integration**:
     - **Gemini API Key**: Paste your API key
     - **Gemini Model**: Leave blank for default (`gemini-2.0-flash`), or set to:
       - `gemini-2.0-flash-lite` — faster, lower cost
       - `gemini-2.5-flash-preview-05-20` — latest preview
   - Click **Save**

3. **Verify**
   - Go to **Bid Management → Tenders**, open a tender with an RFP document
   - Click **Analyze RFP** — should return structured analysis
   - Or open any email in **Mail**, expand the **AI Assistant** panel — should auto-summarize

### Troubleshooting
- **429 Rate Limit**: Free tier has limits. Wait a minute and retry, or switch to a lighter model.
- **403 Invalid Key**: Re-check the API key in Configuration.
- **Empty response**: The document may be too large or in an unsupported format.

---

## 2. Google Drive (Document Management System)

The DMS can store files in Google Drive using a **Service Account**. This is a server-to-server auth — no user login required.

### Prerequisites
- A Google Cloud project
- A Google Drive folder where documents will be stored

### Step 1: Create a Google Cloud Project (if needed)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown → **New Project**
3. Name it (e.g., `srisaa-erp`) and create

### Step 2: Enable the Google Drive API
1. In Google Cloud Console, go to **APIs & Services → Library**
2. Search for **Google Drive API**
3. Click on it → Click **Enable**
4. Wait 1-2 minutes for propagation

### Step 3: Create a Service Account
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Name it (e.g., `srisaa-docs`)
4. Click **Create and Continue** → skip optional steps → **Done**
5. Click on the newly created service account
6. Go to the **Keys** tab → **Add Key → Create new key**
7. Choose **JSON** → **Create**
8. A `.json` file will download — this is your credentials file. Keep it safe.

### Step 4: Share the Drive Folder with the Service Account
1. Open the JSON file and find the `client_email` field (e.g., `srisaa-docs@srisaa-erp.iam.gserviceaccount.com`)
2. In **Google Drive**, create or navigate to the folder where documents should be stored
3. Right-click the folder → **Share**
4. Paste the service account email → set access to **Editor**
5. Click **Send** (uncheck "Notify people" if prompted)
6. Copy the **folder ID** from the URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`

### Step 5: Configure in the App
1. Navigate to **System → Configuration**
2. Under **Document Storage**:
   - **Storage Type**: Select **Google Drive**
   - **Google Service Account Credentials (JSON)**: Paste the **entire contents** of the downloaded JSON key file
   - **Google Drive Root Folder ID**: Paste the folder ID from Step 4
3. Click **Save**

### Step 6: Verify
1. Navigate to **Documents** in the sidebar
2. Create a new folder — it should appear in your Google Drive folder
3. Upload a file — it should appear in the Drive folder

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| "Google Drive API is not enabled" | Drive API not turned on | Go to Cloud Console → APIs & Services → Enable Google Drive API |
| "File not found: {folder_id}" | Service account can't access the folder | Share the Drive folder with the service account email as Editor |
| "Google Drive credentials JSON is invalid" | Malformed JSON in config | Re-paste the full JSON key file contents |
| "Google Drive access denied" | Service account lacks permissions | Verify the folder is shared with the service account email |
| Folder created in app but not in Drive | API was recently enabled | Wait 2-3 minutes for API propagation, then retry |

### Switching Back to Local Storage
1. Go to **System → Configuration**
2. Change **Storage Type** to **Local Folder**
3. Optionally set a **Local Storage Path** (can be any folder, including a cloud-synced folder like OneDrive/Dropbox)
4. Leave blank to use the default (`uploads/documents/`)
5. Click **Save**

> **Note**: Switching storage type does not migrate existing files. Files uploaded to Drive stay in Drive, files saved locally stay on disk. New uploads go to whichever backend is active.

---

## Summary of Config Keys

All configured via **System → Configuration** and stored in the `app_config` database table.

| Key | Purpose | Example |
|-----|---------|---------|
| `gemini_api_key` | Google Gemini API key | `AIzaSy...` |
| `gemini_model` | Gemini model name | `gemini-2.0-flash` |
| `dms_storage_type` | Document storage backend | `LOCAL` or `GOOGLE_DRIVE` |
| `dms_local_path` | Custom local folder path | `/mnt/shared/docs` or blank for default |
| `dms_google_credentials` | Service account JSON key | `{"type":"service_account",...}` |
| `dms_google_folder_id` | Root Drive folder ID | `1Fth6obynL2uAjwo-5lMc53...` |
