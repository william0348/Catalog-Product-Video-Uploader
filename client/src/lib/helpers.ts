
export const getColumnLetter = (colIndex: number): string => {
    let temp, letter = '';
    while (colIndex > 0) {
        temp = (colIndex - 1) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        colIndex = (colIndex - temp - 1) / 26;
    }
    return letter;
};

export const getVideoMetadata = (file: File): Promise<{ width: number; height: number; duration: number }> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        
        video.onloadedmetadata = () => {
            window.URL.revokeObjectURL(video.src);
            resolve({
                width: video.videoWidth,
                height: video.videoHeight,
                duration: video.duration,
            });
        };
        
        video.onerror = () => {
            window.URL.revokeObjectURL(video.src);
            reject('Could not load video metadata.');
        };
        
        video.src = window.URL.createObjectURL(file);
    });
};
