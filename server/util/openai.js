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
    apiKey: apiKey,
    baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
    defaultQuery: { 'api-version': '2023-06-01-preview' },
    defaultHeaders: { 'api-key': apiKey }
});

export const summarize = async (text, postLanguage) => {
    if (text) {
        // The code below is for localized text improvements. GPT3 doesn't perform that well on localized text and may return the completion back in English. 
        // Overwriting the prompt may help in this respect.
        //var promptSystem = "You are a helpful assistant that summarizes news articles in a serious tone yet witty way. Start with a bulleted list containing a breakdown of the article's key points and create a closing paragraph with your opinions titled 'Personal opinions'. Include h1,h2,h3 tags in the final output where appropriate. Use the following template if applicable. Even if you don't have opinions or emotions regarding the subject, pretend you do in accordance with the context. Don't start your responses with confirmatory statements like 'Sure, here you go:', 'Yes, here's your summary:', etc.\n\nTitle\n\nShort Summary\nKey Highlights (bulleted list)\nMain article\nPersonal Opinions/Analysis\nConclusion (Optional)\nReferences/Sources\nSource: LINK (<link> tag we get from rss feed)\nDont forget the html tags";
        var promptSystem = "You are a helpful assistant that summarizes news articles in a serious tone yet witty way. Start with a short summary including a bulleted list containing a breakdown of the article's key points. Next, add a longer summary of the main article. Use the following template:\n\n<h4>Short summary</h4>\n<h4>Key highlights</h4> (bulleted list)\n<h4>Main article</h4>\n\nDont forget the html tags";
        var promptUser = text;
        //if (typeof postLanguage != 'undefined' && postLanguage == process.env['NATIVE_LANGUAGE'] && typeof process.env['NATIVE_SYSTEM_PROMPT'] != 'undefined' && typeof process.env['NATIVE_USER_PROMPT'] != 'undefined') {
            //var promptSystem = process.env['NATIVE_SYSTEM_PROMPT'];
            //var promptUser = process.env['NATIVE_USER_PROMPT'] + " " + text;
        //}
        // Submit stripped article content to OpenAI for summarization.
        const chatCompletion = await openai.chat.completions.create({
            model,
            messages: [
                {"role": "system", "content": promptSystem},
                {"role": "user", "content": promptUser }
            ],
        });

        return chatCompletion;
    }
};

export const classify = async (text) => {
    if (text) {
        // Submit stripped article content to OpenAI for classifications.
        const chatCompletion = await openai.chat.completions.create({
            model,
            messages: [
                {"role": "system", "content": "You are a journalist. You process blog posts and articles."},
                {"role": "assistant", "content": "provide 5 tags for this blog post"},
                {"role": "assistant", "content": "output tags as CSV, comma separated values"},
                {"role": "user", "content": text}
            ],
            });
        console.log('Classifications by OpenAI: ' + chatCompletion.choices[0].message.content);        
        return chatCompletion.choices[0].message.content;
    }
};

export default {
    summarize,
    classify
}