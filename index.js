import { google } from "googleapis";
import { Storage } from "@google-cloud/storage";

const storage = new Storage();
const drive = google.drive("v3");

// 🔴 IMPORTANT: this must match your bucket name exactly
const BUCKET_NAME = "frh-rnt-property-review";
const GCS_PREFIX = "Rent_search_MkDwn/";

export async function syncDriveToGCS(req, res) {
  try {
    // Authenticate using the service account
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/drive.readonly"]
    });
    const authClient = await auth.getClient();
    google.options({ auth: authClient });

    // List files in Drive (non-folders)
    const response = await drive.files.list({
      q: "mimeType!='application/vnd.google-apps.folder'",
      fields: "files(id, name, modifiedTime)"
    });

    let copied = 0;

    for (const file of response.data.files) {
      // Only sync markdown files
      if (!file.name.endsWith(".md")) continue;

      const fileStream = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "stream" }
      );

      const gcsFile = storage
        .bucket(BUCKET_NAME)
        .file(GCS_PREFIX + file.name);

      await new Promise((resolve, reject) => {
        fileStream.data
          .pipe(gcsFile.createWriteStream())
          .on("finish", resolve)
          .on("error", reject);
      });

      copied++;
    }

    res.status(200).json({
      message: "Drive sync completed",
      filesCopied: copied
    });
  } catch (error) {
    res.status(500).json({
      error: "Sync failed",
      details: error.message
    });
  }
}
