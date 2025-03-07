const BASE_URL = "https://api.semanticscholar.org";
const BASE_GRAPH_URL = `${BASE_URL}/graph/v1`;
const BASE_RECOMMENDATIONS_URL = `${BASE_URL}/recommendations/v1`;
const DEFAULT_FIELDS = "paperId,title,authors,abstract,references,referenceCount,citationCount,venue,year";

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
                    "x-api-key": import.meta.env.VITE_SS_API_KEY,
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
    limit = 10,
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
                    "x-api-key": import.meta.env.VITE_SS_API_KEY,
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

export async function getCitationsForPaper(paperId, limit=20) {

    if (!paperId) {
        console.error("Error: paperId must be a non-empty string.");
        throw new Error("Invalid input: paperId must be a non-empty string.");
    }

    const requestUrl = `${BASE_GRAPH_URL}/paper/${paperId}/citations?fields=paperId&limit=${limit}`;
    console.log("requesting citations for paperId:", paperId);

    let attempts = 0;
    const maxAttempts = 20;
    let lastError;

    while (attempts < maxAttempts) {
        try {
            const response = await fetch(requestUrl, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": import.meta.env.VITE_SS_API_KEY,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `Error: Failed to fetch citations (Status: ${response.status})`
                );
                console.error(`Response body: ${errorText}`);
                throw new Error(
                    `Failed to fetch citations: ${response.status} - ${errorText}`
                );
            }

            const data = await response.json();
            console.log("Citations received from Semantic Scholar!");
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

export async function getReferencesForPaper(paperId, limit=20) {

    if (!paperId) {
        console.error("Error: paperId must be a non-empty string.");
        throw new Error("Invalid input: paperId must be a non-empty string.");
    }

    const requestUrl = `${BASE_GRAPH_URL}/paper/${paperId}/references?fields=paperId&limit=${limit}`;
    console.log("requesting references for paperId:", paperId);

    let attempts = 0;
    const maxAttempts = 20;
    let lastError;

    while (attempts < maxAttempts) {
        try {
            const response = await fetch(requestUrl, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": import.meta.env.VITE_SS_API_KEY,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `Error: Failed to fetch references (Status: ${response.status})`
                );
                console.error(`Response body: ${errorText}`);
                throw new Error(
                    `Failed to fetch references: ${response.status} - ${errorText}`
                );
            }

            const data = await response.json();
            console.log("References received from Semantic Scholar!");
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

export async function getAuthorsPapers(authorId, limit=20) {

    if (!authorId) {
        console.error("Error: authorId must be a non-empty string.");
        throw new Error("Invalid input: authorId must be a non-empty string.");
    }

    const requestUrl = `${BASE_GRAPH_URL}/author/${authorId}/papers?fields=${DEFAULT_FIELDS}&limit=${limit}`;
    console.log("requesting papers from author:", authorId);

    let attempts = 0;
    const maxAttempts = 20;
    let lastError;

    while (attempts < maxAttempts) {
        try {
            const response = await fetch(requestUrl, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": import.meta.env.VITE_SS_API_KEY,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `Error: Failed to fetch author's papers (Status: ${response.status})`
                );
                console.error(`Response body: ${errorText}`);
                throw new Error(
                    `Failed to fetch author's papers: ${response.status} - ${errorText}`
                );
            }

            const data = await response.json();
            console.log("Author's papers received from Semantic Scholar!");
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