import {SearchClient,SearchIndexClient,SearchIndexerClient,AzureKeyCredential} from '@azure/search-documents';

//set the index name for the azure ai search
const index_name = "rssmonster-index";

//set the search endpoint for the azure ai search
const endpoint = process.env['SEARCH_ENDPOINT'];

//set the search key for the azure ai search
const apiKey = process.env['SEARCH_API_KEY'];

// To index documents
const clientIndex = new SearchIndexClient(endpoint, new AzureKeyCredential(apiKey));

// To query and manipulate documents
const client = new SearchClient(endpoint, index_name, new AzureKeyCredential(apiKey));

export const index = async () => {
    const result = await clientIndex.createIndex({
        name: index_name,
        fields: [
            {
                type: "Edm.String",
                name: "Id",
                key: true,
                filterable: true
            },
            {
                type: "Edm.String",
                name: "articleUrl",
                filterable: true
            },
            {
                type: "Edm.String",
                name: "feedName",
                searchable: true,
                filterable: true
            },
            {
                type: "Edm.DateTimeOffset",
                name: "articlePublishDate",
                filterable: true,
                sortable: true
            },
            {
                type: "Edm.String",
                name: "articleSubject",
                searchable: true
            },
            {
                type: "Edm.String",
                name: "articleContent",
                searchable: true
            },
            {
                type: "Collection(Edm.Single)",
                name: "articleContentVector",
                searchable: true,
                retrievable: true,
                dimensions: 1536,
                vectorSearchProfile: null
            },
            {
                type: "Edm.Int32",
                name: "hiddenWeight",
                hidden: true,
            }
        ]
    });

    console.log(result);
}

export const add = async (article) => {
    const uploadResult = await client.uploadDocuments([
            {
                Id: article.Id,
                articleUrl: article.articleUrl,
                feedName: article.feedName,
                articlePublishDate: article.articlePublishDate,
                articleSubject: article.articleSubject,
                articleContent: article.articleContent,
                hiddenWeight: 1
            }
        ]);
    for (const result of uploadResult.results) {
        console.log(`Uploaded ${result.key}; succeeded? ${result.succeeded}`);
    }
}

export default {
    add,
    index
}