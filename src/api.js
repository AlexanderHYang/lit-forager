const BASE_URL = "https://api.semanticscholar.org";
const BASE_GRAPH_URL = `${BASE_URL}/graph/v1`;
const BASE_RECOMMENDATIONS_URL = `${BASE_URL}/recommendations/v1`;
const DEFAULT_FIELDS = "paperId,title,authors,abstract,references,referenceCount,citationCount";

export async function getDetailsForMultiplePapers(paperIds) {
    if (!Array.isArray(paperIds) || paperIds.length === 0) {
        console.error("Error: paperIds must be a non-empty array.");
        throw new Error("Invalid input: paperIds must be a non-empty array.");
    }

    const requestUrl = `${BASE_GRAPH_URL}/paper/batch?fields=${DEFAULT_FIELDS}`;
    const body = JSON.stringify({
        ids: paperIds,
    });

    let attempts = 0;
    const maxAttempts = 20;
    let lastError;

    while (attempts < maxAttempts) {
        try {
            const response = await fetch(requestUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: body,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Error: Failed to fetch paper details (Status: ${response.status})`);
                console.error(`Response body: ${errorText}`);
                throw new Error(`Failed to fetch paper details: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log("Paper details received from Semantic Scholar!");
            return data;
        } catch (error) {
            attempts++;
            lastError = error;
            console.error(`Attempt ${attempts} failed: ${error.message}`);
            if (attempts >= maxAttempts) {
                throw new Error(
                    `All ${maxAttempts} attempts failed. Last error: ${lastError.message}`
                );
            }
            // Wait for 1 second before retrying
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

export async function fetchRecsFromMultipleIds(
    positiveIds,
    negativeIds = [],
    limit = 5,
    fields = "paperId"
) {
    if (!Array.isArray(positiveIds) || positiveIds.length === 0) {
        console.error("Error: positiveIds must be a non-empty array.");
        throw new Error("Invalid input: positiveIds must be a non-empty array.");
    }

    const requestUrl = `${BASE_RECOMMENDATIONS_URL}/papers?limit=${limit}&fields=${fields}`;
    // console.log(requestUrl);
    console.log("requesting recommendations from positiveIds:", positiveIds);

    const body = JSON.stringify({
        positivePaperIds: positiveIds,
        negativePaperIds: negativeIds,
    });

    let attempts = 0;
    const maxAttempts = 20;
    let lastError;

    while (attempts < maxAttempts) {
        try {
            const response = await fetch(requestUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: body,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `Error: Failed to fetch recommendations (Status: ${response.status})`
                );
                console.error(`Response body: ${errorText}`);
                throw new Error(
                    `Failed to fetch recommendations: ${response.status} - ${errorText}`
                );
            }

            const data = await response.json();
            console.log("Recommendations received from Semantic Scholar!");
            return data;
        } catch (error) {
            attempts++;
            lastError = error;
            console.error(`Attempt ${attempts} failed: ${error.message}`);
            if (attempts >= maxAttempts) {
                throw new Error(
                    `All ${maxAttempts} attempts failed. Last error: ${lastError.message}`
                );
            }
            // Wait for 1 second before retrying
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}
