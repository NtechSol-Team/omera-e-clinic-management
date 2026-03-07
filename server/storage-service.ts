import axios from "axios";
import FormData from "form-data";
import fs from "fs";

const STORAGE_BASE_URL = "http://ec2-3-95-245-114.compute-1.amazonaws.com:3008/api/files";

export async function uploadToStorage(filePath: string, fileName: string): Promise<string> {
    const apiKey = process.env.STORAGE_API_KEY;
    if (!apiKey) {
        throw new Error("STORAGE_API_KEY is not set in environment variables.");
    }

    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath), { filename: fileName });
    formData.append("folder", "os");

    const response = await axios.post(`${STORAGE_BASE_URL}/upload`, formData, {
        headers: {
            ...formData.getHeaders(),
            "x-api-key": apiKey,
        },
    });

    const data = response.data;
    if (data) {
        // Paramount robustness: check every possible location for the ID
        const fileId = data.file?.id || data.file?._id || data.fileId || data.id || (typeof data === 'string' && JSON.parse(data).file?.id);
        if (fileId) return fileId;
    }

    console.error("Storage upload failure. Response data:", JSON.stringify(data, null, 2));
    throw new Error("Failed to upload file to storage service: " + JSON.stringify(data));
}

export async function getSignedUrlFromStorage(fileId: string): Promise<string> {
    const apiKey = process.env.STORAGE_API_KEY;
    const response = await axios.get(`${STORAGE_BASE_URL}/file/${fileId}/sign-url`, {
        headers: {
            "x-api-key": apiKey,
        },
    });

    if (response.data) {
        const url = response.data.signedUrl || response.data.url;
        if (url) return url;
    }

    throw new Error("Failed to get signed URL from storage service: " + JSON.stringify(response.data));
}

export async function deleteFromStorage(fileId: string): Promise<void> {
    const apiKey = process.env.STORAGE_API_KEY;
    await axios.delete(`${STORAGE_BASE_URL}/file/${fileId}`, {
        headers: {
            "x-api-key": apiKey,
        },
    });
}
