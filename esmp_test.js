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

  const parts = fileBaseName.split("_");
  let id, titleParts;

  if (/^ESMP\d+$/.test(parts[0])) {
    // 첫 번째 부분이 ESMP로 시작하는 숫자인지 확인
    id = parts[0].replace("ESMP", ""); // ESMP 접두어 제거
    titleParts = parts.slice(1);
  } else {
    id = parts[0]; // 숫자가 아니면 첫 번째 부분을 id로 사용
    titleParts = parts.slice(1);
  }

  let title = titleParts.join("_").trim();
  let statusMatch = title.match(/\((.*?)\)\s*$/);
  let status = statusMatch ? statusMatch[1] : "Unknown";

  if (statusMatch) {
    title = title.replace(statusMatch[0], "").trim();
  }

  console.log(`ID: ${id}, Title: ${title}, Status: ${status}`);

  const searchUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
  console.log(title);
  const searchPayload = {
    filter: {
      property: "Song",
      title: {
        equals: title,
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
      fileToPageId[title] = pageId;
      console.log(`${title}에 대한 기존 페이지 업데이트: ${pageId}`);

      const updateData = {
        properties: {
          Properties: {
            multi_select: [{ name: status }],
          },
          ID: {
            number: Number(id),
          },
        },
      };

      await axios.patch(
        `https://api.notion.com/v1/pages/${pageId}`,
        updateData,
        { headers: notionHeaders }
      );
      console.log(`${title} 페이지 업데이트 성공: ${pageId}`);
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
                  content: title,
                },
              },
            ],
          },
          ID: {
            number: Number(id),
          },
          Properties: {
            multi_select: [{ name: status }],
          },
        },
      };
      const createResponse = await axios.post(
        "https://api.notion.com/v1/pages",
        pageData,
        { headers: notionHeaders }
      );
      const pageId = createResponse.data.id;
      fileToPageId[title] = pageId;
      console.log(`${title}에 대한 페이지 생성 성공: ${pageId}`);
    }
  } catch (error) {
    if (error.response) {
      console.error(
        `API 요청 중 오류 발생: ${error.response.status} - ${error.response.statusText}`
      );
      console.error(`오류 응답 데이터: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`API 요청 중 오류 발생: ${error.message}`);
    }
  } finally {
    delete processingFiles[fileBaseName];
  }
};

const archivePage = async (pageId, pageTitle) => {
  const archiveUrl = `https://api.notion.com/v1/pages/${pageId}`;
  const archiveData = { archived: true };

  try {
    await axios.patch(archiveUrl, archiveData, { headers: notionHeaders });
    console.log(`${pageTitle}에 대한 페이지 아카이브 성공: ${pageId}`);
    delete fileToPageId[pageTitle];
  } catch (error) {
    if (error.response) {
      console.error(
        `API 요청 중 오류 발생: ${error.response.status} - ${error.response.statusText}`
      );
      console.error(`오류 응답 데이터: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`API 요청 중 오류 발생: ${error.message}`);
    }
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
    return !filesInFolder.some((fileBaseName) =>
      fileBaseName.includes(pageTitle)
    );
  });

  await Promise.all(
    pagesToArchive.map(async (page) => {
      const pageTitle = page.properties.Song.title[0].text.content;
      fileToPageId[pageTitle] = page.id;
      await archivePage(page.id, pageTitle);
    })
  );

  await Promise.all(
    filesInFolder.map(async (fileBaseName) => {
      await createOrUpdatePage(fileBaseName);
    })
  );
};

uploadExistingFiles("/Users/aeonapsychelovelace/Downloads/ESMP/test2");
