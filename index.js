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
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/drive.readonly"]
    });

    const authClient = await auth.getClient();
    google.options({ auth: authClient });

    const response = await drive.files.list({
      q: `'${DRIVE_FOLDER_ID}' in parents and mimeType!='application/vnd.google-apps.folder'`,
      fields: "files(id, name)"
    });

    let copied = 0;
    const bucket = storage.bucket(BUCKET_NAME);

    for (const file of response.data.files) {
      if (!file.name.endsWith(".md")) continue;

      const destFile = bucket.file(`${GCS_PREFIX}${file.name}`);
      const [exists] = await destFile.exists();
      if (exists) continue;

      const driveStream = await drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "stream" }
      );

      await new Promise((resolve, reject) => {
        driveStream.data
          .pipe(destFile.createWriteStream())
          .on("finish", resolve)
          .on("error", reject);
      });

      copied++;
    }

    res.json({ message: "Drive sync completed", filesCopied: copied });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
