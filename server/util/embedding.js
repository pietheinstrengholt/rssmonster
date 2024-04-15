import OpenAI from 'openai';

// The name of your Azure OpenAI Resource.
// https://learn.microsoft.com/en-us/azure/cognitive-services/openai/how-to/create-resource?pivots=web-portal#create-a-resource
const resource = process.env['OPENAI_RESOURCE_NAME'];

// Corresponds to your Embedding Model deployment within your OpenAI resource, e.g. text-embedding-ada-002
// Navigate to the Azure OpenAI Studio to deploy a model.
const model = process.env['OPENAI_EMBEDDING_MODEL_NAME'];

// Your Azure OpenAI API Key. You can obtain this from the Azure Portal.
const apiKey = process.env['OPENAI_API_KEY'];
if (!apiKey) {
    throw new Error('The OPENAI_API_KEY environment variable is missing or empty.');
}

// Azure OpenAI requires a custom baseURL, api-version query param, and api-key header.
const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
    defaultQuery: { 'api-version': '2023-06-01-preview' },
    defaultHeaders: { 'api-key': apiKey }
});

export const embed = async (text) => {
    if (text) {
        // Submit stripped article content to OpenAI for classifications.
        const embedding = await openai.embeddings.create({
            engine: "text-embedding-ada-002",
            input: text,
            encoding_format: "float",
        });    
        return embedding.data[0].embedding;
    }
};

export default {
    embed
}