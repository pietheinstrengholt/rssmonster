import embedding from "../util/embedding.js";

import {SearchClient,SearchIndexClient,AzureKeyCredential} from '@azure/search-documents';

//set the index name for the azure ai search
const index_name = process.env['SEARCH_INDEX'];

//set the search endpoint for the azure ai search
const endpoint = process.env['SEARCH_ENDPOINT'];

//set the search key for the azure ai search
const apiKey = process.env['SEARCH_API_KEY'];

// To index documents
const clientIndex = new SearchIndexClient(endpoint, new AzureKeyCredential(apiKey));

// To query and manipulate documents
const client = new SearchClient(endpoint, index_name, new AzureKeyCredential(apiKey));

// Create index
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
                type: "Collection(Edm.Single)",
                name: "articleSubjectVector",
                searchable: true,
                vectorSearchDimensions: 1536,
                vectorSearchProfileName: "myHnswProfile"
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
                vectorSearchDimensions: 1536,
                vectorSearchProfileName: "myHnswProfile"
            },
            {
                type: "Edm.Int32",
                name: "hiddenWeight",
                hidden: true,
            }
        ],
        vectorSearch: {
            algorithms: [{ name: "myHnswAlgorithm", kind: "hnsw" }],
            profiles: [
                {
                    name: "myHnswProfile",
                    algorithmConfigurationName: "myHnswAlgorithm",
                },
            ],
        },
        semanticSearch: {
            configurations: [
                {
                name: "my-semantic-config",
                prioritizedFields: {
                    contentFields: [{ name: "articleContent" }],
                    keywordsFields: [{ name: "feedName" }],
                },
                }
            ]
        }
    });

    console.log(result);
    console.log("Creating index...");
}

// add document to index
export const add = async (article) => {
    await client.uploadDocuments([
        {
            Id: article.Id,
            articleUrl: article.articleUrl,
            feedName: article.feedName,
            articlePublishDate: article.articlePublishDate,
            articleSubject: article.articleSubject,
            articleSubjectVector: await embedding.embed(article.articleSubject),
            articleContent: article.articleContent,
            articleContentVector: await embedding.embed(article.articleContent),
            hiddenWeight: 1
        }
    ]);
}

// search index
export const search = async (searchText, includeSubject, feedName) => {

    let options = {
        select: ["feedName", "articleSubject", "articleContent"],
        top: 3
    };

    let vectorFields = includeSubject ? [ "articleContentVector", "articleSubjectVector" ] : [ "articleContentVector" ];

    options["vectorSearchOptions"] = {
        queries:  [
            {
                kind: "vector",
                vector: await embedding.embed(searchText),
                kNearestNeighborsCount: 50,
                fields: vectorFields
            }
        ]
    }

    if (feedName) {
        options["filter"] = `feedName eq '${feedName}'`;
    }

    options["queryType"] = "semantic";
    options["semanticSearchOptions"] = {
        answers: {
          answerType: "extractive"
        },
        captions:{
            captionType: "extractive"
        },
        configurationName: "my-semantic-config",
    }

    const response = await client.search(searchText, options);
    for await (const result of response.results) {
        console.log('----');
        console.log(`feedName: ${result.document.feedName}`);
        console.log(`Score: ${result.score}`);
        console.log(`Reranker Score: ${result.rerankerScore}`); // Reranker score is the semantic score
        console.log(`articleSubject: ${result.document.articleSubject}`);
        console.log(`articleContent: ${result.document.articleContent}`);
    }
    return response.results;
}

export default {
    add,
    index,
    search
}