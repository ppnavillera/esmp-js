require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const notionToken = process.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_DATABASE_ID;

if (!notionToken || !databaseId) {
  throw new Error(
    "NOTION_TOKEN 또는 NOTION_DATABASE_ID 환경 변수가 설정되지 않았습니다."
  );
}

const notionHeaders = {
  Authorization: `Bearer ${notionToken}`,
  "Content-Type": "application/json",
  "Notion-Version": "2022-06-28",
};

const fileToPageId = {};
const processingFiles = {}; // 파일 처리 상태를 추적하는 객체

const createOrUpdatePage = async (fileBaseName) => {
  if (processingFiles[fileBaseName]) {
    console.log(`${fileBaseName} 이미 처리 중입니다.`);
    return;
  }

  processingFiles[fileBaseName] = true;
  console.log(`createOrUpdatePage 호출: ${fileBaseName}`);

  const searchUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
  const searchPayload = {
    filter: {
      property: "Song",
      title: {
        equals: fileBaseName,
      },
    },
  };

  try {
    const response = await axios.post(searchUrl, searchPayload, {
      headers: notionHeaders,
    });
    const results = response.data.results;
    if (results.length > 0) {
      const pageId = results[0].id;
      fileToPageId[fileBaseName] = pageId;
      console.log(`${fileBaseName}에 대한 기존 페이지 업데이트: ${pageId}`);
    } else {
      const pageData = {
        parent: {
          database_id: databaseId,
        },
        properties: {
          Song: {
            title: [
              {
                text: {
                  content: fileBaseName,
                },
              },
            ],
          },
        },
      };
      const createResponse = await axios.post(
        "https://api.notion.com/v1/pages",
        pageData,
        { headers: notionHeaders }
      );
      const pageId = createResponse.data.id;
      fileToPageId[fileBaseName] = pageId;
      console.log(`${fileBaseName}에 대한 페이지 생성 성공: ${pageId}`);
    }
  } catch (error) {
    console.error(`API 요청 중 오류 발생: ${error}`);
  } finally {
    delete processingFiles[fileBaseName];
  }
};

const archivePage = async (fileBaseName) => {
  const pageId = fileToPageId[fileBaseName];
  if (pageId) {
    const archiveUrl = `https://api.notion.com/v1/pages/${pageId}`;
    const archiveData = { archived: true };

    try {
      await axios.patch(archiveUrl, archiveData, {
        headers: notionHeaders,
      });
      console.log(`${fileBaseName}에 대한 페이지 아카이브 성공: ${pageId}`);
      delete fileToPageId[fileBaseName];
    } catch (error) {
      if (error.response) {
        console.error(
          `API 요청 중 오류 발생: ${error.response.status} - ${error.response.statusText}`
        );
        console.error(
          `오류 응답 데이터: ${JSON.stringify(error.response.data)}`
        );
      } else {
        console.error(`API 요청 중 오류 발생: ${error.message}`);
      }
    }
  } else {
    console.log(
      `파일에 해당하는 페이지 ID를 찾을 수 없습니다: ${fileBaseName}`
    );
  }
};

const getNotionPages = async () => {
  let pages = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      { start_cursor: startCursor },
      { headers: notionHeaders }
    );

    pages = pages.concat(response.data.results);
    hasMore = response.data.has_more;
    startCursor = response.data.next_cursor;
  }

  return pages;
};

const uploadExistingFiles = async (folderPath) => {
  const filesInFolder = fs
    .readdirSync(folderPath)
    .filter((fileName) => fileName !== ".DS_Store")
    .map((fileName) => path.parse(fileName).name);

  const notionPages = await getNotionPages();

  const pagesToArchive = notionPages.filter((page) => {
    const pageTitle = page.properties.Song.title[0].text.content;
    return !filesInFolder.includes(pageTitle);
  });

  await Promise.all(
    pagesToArchive.map(async (page) => {
      const pageTitle = page.properties.Song.title[0].text.content;
      fileToPageId[pageTitle] = page.id;
      await archivePage(pageTitle);
    })
  );

  filesInFolder.forEach((fileBaseName) => {
    createOrUpdatePage(fileBaseName);
  });
};

uploadExistingFiles("/Users/aeonapsychelovelace/Downloads/ESMP/t");
