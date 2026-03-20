
import type { ApiError } from '@/types';

export const apiFetch = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    const errorData = data as ApiError;
    throw new Error(
      errorData.error?.message || "An unknown API error occurred."
    );
  }
  return (data.data || data) as T; // Handle pagination and direct data
};

/**
 * Fetches all pages of data from a paginated API endpoint.
 *
 * @param url The initial URL to fetch from. The API response from this URL
 *            is expected to have a `paging.next` property for the next page.
 * @param onProgress An optional callback function that is called after each
 *                   page is fetched. It receives the number of items loaded
 *                   so far and the total count (if available from the API).
 * @returns A promise that resolves to an array containing all the items
 *          from every page.
 */
export const fetchAllPages = async <T,>(
    url: string,
    onProgress?: (progress: { loaded: number; total: number | null }) => void
): Promise<T[]> => {
    let allData: T[] = [];
    let currentUrl: string | undefined = url;
    let total: number | null = null;
    let isFirstRequest = true;

    // Loop as long as there is a URL for the next page of data
    while(currentUrl) {
        const response: Response = await fetch(currentUrl);
        const pageData: any = await response.json();

        if (!response.ok) {
            const errorData = pageData as ApiError; // ApiError is a custom type
            throw new Error(
                errorData.error?.message || "An unknown API error occurred."
            );
        }

        // On the first API call, try to get the total number of items for the progress indicator
        if (isFirstRequest) {
            if (pageData.summary && pageData.summary.total_count) {
                total = pageData.summary.total_count;
            }
            isFirstRequest = false;
        }

        // Add the items from the current page (batch) to our main array
        if (pageData.data && Array.isArray(pageData.data)) {
            allData = allData.concat(pageData.data);
            if (onProgress) {
                onProgress({ loaded: allData.length, total });
            }
        }
        
        // The key to pagination: get the URL for the next batch of items
        currentUrl = pageData.paging?.next;

        // A small delay to be respectful to the API and avoid rate-limiting
        if (currentUrl) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    return allData;
};
