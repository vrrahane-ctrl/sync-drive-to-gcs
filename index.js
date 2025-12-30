import express from "express";
import { google } from "googleapis";
import { Storage } from "@google-cloud/storage";

const app = express();
const storage = new Storage();
const drive = google.drive("v3");

const BUCKET_NAME = "frh-rnt-property-review";
const GCS_PREFIX = "Rent_search_MkDwn/";
const DRIVE_FOLDER_ID = "1Ce1JRMU-Tggvgj7ebTwGg9_PjRqHAJt5";

app.get("/", async (req, res) => {
  try {
    // Authenticate using Cloud Run service account
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/drive.readonly"]
    });

    const authClient = await auth.getClient();
    google.options({ auth: authClient });

    // List files INSIDE the Drive folder
    const response = await drive.files.list({
      q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,
      fields: "files(id, name, mimeType)"
    });

    const files = response.data.files || [];
    let copied = 0;

    const bucket = storage.bucket(BUCKET_NAME);

    for (const file of files) {
      // Destination filename
      const outputName =
        file.mimeType === "application/vnd.google-apps.document"
          ? `${file.name}.md`
          : file.name;

      const destFile = bucket.file(`${GCS_PREFIX}${outputName}`);

      // Skip if already copied
      const [exists] = await destFile.exists();
      if (exists) continue;

      let driveStream;

      // Google Docs → export as Markdown
      if (file.mimeType === "application/vnd.google-apps.document") {
        driveStream = await drive.files.export(
          {
            fileId: file.id,
            mimeType: "text/markdown"
          },
          { responseType: "stream" }
        );
      } else {
        // Normal file (.md already)
        driveStream = await drive.files.get(
          { fileId: file.id, alt: "media" },
          { responseType: "stream" }
        );
      }

      await new Promise((resolve, reject) => {
        driveStream.data
          .pipe(destFile.createWriteStream())
          .on("finish", resolve)
          .on("error", reject);
      });

      copied++;
    }

    res.json({
      message: "Drive sync completed",
      filesFound: files.length,
      filesCopied: copied
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
