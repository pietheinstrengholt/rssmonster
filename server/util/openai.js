import OpenAI from "openai";

// Corresponds to your Model deployment within your OpenAI resource, e.g. gpt-4o-mini.
const model = process.env['OPENAI_MODEL_NAME'];

// Your Azure OpenAI API Key. You can obtain this from the Azure Portal.
const apiKey = process.env['OPENAI_API_KEY'];
if (!apiKey) {
    throw new Error('The OPENAI_API_KEY environment variable is missing or empty.');
}

const openai = new OpenAI({
    apiKey: apiKey,
});

export const summarize = async (text) => {
    if (text) {
        // Submit stripped article content to OpenAI for summarization.
        const completion = await openai.chat.completions.create({
            model: model,
            messages: [
                {"role": "system", "content": "You are a journalist. You process blog posts and articles. You are not allowed to change the language of the text."},
                {"role": "user", "content": 'Remove any advertisements or promotional appearances and return a summary in text format using the original language: ' + text }
            ],
        });

        return completion.choices[0].message.content;
    }
};

export const classify = async (text) => {
    if (text) {
        // Submit stripped article content to OpenAI for classifications.
        const classifications = await openai.chat.completions.create({
            model: model,
            response_format: { type: "json_object" },
            messages: [
                {"role": "system", "content": "You are a content analysis assistant specialized in generating SEO tags for articles. Your task is to create a list of relevant, high-volume SEO tags that help visitors find articles by identifying specific themes or ideas discussed in the content. Tags must be simple, direct, and in the singular form. Tags must be composed of natural English words only. Tags must focus on the core concepts without using general terms."},
                {"role": "assistant", "content": "Generate a list of 5-7 relevant, high-volume SEO tags based on the following article content."},
                {"role": "assistant", "content": "Your response must be in json format, with a parent element named tags, and each tag as a child element."},
                {"role": "user", "content": text}
            ],
        });

        return JSON.parse(classifications.choices[0].message.content);
    }
};

export default {
    summarize,
    classify
};