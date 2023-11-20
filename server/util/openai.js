import OpenAI from 'openai';

// The name of your Azure OpenAI Resource.
// https://learn.microsoft.com/en-us/azure/cognitive-services/openai/how-to/create-resource?pivots=web-portal#create-a-resource
const resource = process.env['OPENAI_RESOURCE_NAME'];

// Corresponds to your Model deployment within your OpenAI resource, e.g. my-gpt35-16k-deployment
// Navigate to the Azure OpenAI Studio to deploy a model.
const model = process.env['OPENAI_MODEL_NAME'];

// Your Azure OpenAI API Key. You can obtain this from the Azure Portal.
const apiKey = process.env['OPENAI_API_KEY'];
if (!apiKey) {
    throw new Error('The OPENAI_API_KEY environment variable is missing or empty.');
}

// Azure OpenAI requires a custom baseURL, api-version query param, and api-key header.
const openai = new OpenAI({
    apiKey,
    baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
    defaultQuery: { 'api-version': '2023-06-01-preview' },
    defaultHeaders: { 'api-key': apiKey }
});

export const summarize = async (text) => {
    if (text) {
        // Submit stripped article content to OpenAI for summarization.
        const result = await openai.chat.completions.create({
            model,
            messages: [
                {"role": "system", "content": "You are a journalist. You process blog posts and articles. You are not allowed to change the language of the text."},
                {"role": "user", "content": 'Remove any advertisements or promotional appearances and return a summary in text format using the original language: ' + text }
            ],
        });

        console.log('Summarization by OpenAI: ' + result.choices[0].message.content);
    }
};

export const classify = async (text) => {
    if (text) {
        // Submit stripped article content to OpenAI for classifications.
        const classifications = await openai.chat.completions.create({
            model,
            messages: [
                {"role": "system", "content": "You are a journalist. You process blog posts and articles. You are not allowed to change the language of the text. "},
                {"role": "assistant", "content": "provide 5 tags for this blog post"},
                {"role": "assistant", "content": "output tags as CSV, comma separated values"},
                {"role": "user", "content": text}
            ],
            });
            
        console.log('Classifications by OpenAI: ' + classifications.choices[0].message.content);
    }
};

export default {
    summarize,
    classify
}