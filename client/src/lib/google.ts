
import { GOOGLE_AUTH_TOKEN_KEY } from '@/constants';
declare const gapi: any;

// Finds or creates a "CPV Uploads" folder in the user's Google Drive.
export const getDriveFolderId = async (): Promise<string> => {
    const FOLDER_NAME = 'CPV Uploads';
    const cachedFolderId = sessionStorage.getItem('google_drive_folder_id');
    if (cachedFolderId) {
        return cachedFolderId;
    }

    gapi.client.setToken({ access_token: localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY) });
    
    // Search for the folder in the user's Drive
    const response = await gapi.client.drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive'
    });

    if (response.result.files && response.result.files.length > 0) {
        // Folder exists, cache and return its ID
        const folderId = response.result.files[0].id;
        sessionStorage.setItem('google_drive_folder_id', folderId);
        return folderId;
    } else {
        // Folder doesn't exist, create it
        const fileMetadata = {
            name: FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder'
        };
        const createResponse = await gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });
        const folderId = createResponse.result.id;
        sessionStorage.setItem('google_drive_folder_id', folderId);
        return folderId;
    }
};
