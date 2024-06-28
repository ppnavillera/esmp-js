require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const chokidar = require("chokidar");

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

  processingFiles[fileBaseName] = true; // 파일 처리 시작
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
    delete processingFiles[fileBaseName]; // 파일 처리 완료
  }
};

const archivePage = async (fileBaseName) => {
  const pageId = fileToPageId[fileBaseName];
  if (pageId) {
    const archiveUrl = `https://api.notion.com/v1/pages/${pageId}`;
    const archiveData = { archived: true };

    try {
      await axios.patch(archiveUrl, archiveData, { headers: notionHeaders });
      console.log(`${fileBaseName}에 대한 페이지 아카이브 성공: ${pageId}`);
      delete fileToPageId[fileBaseName];
    } catch (error) {
      console.error(`API 요청 중 오류 발생: ${error}`);
    }
  } else {
    console.log(
      `파일에 해당하는 페이지 ID를 찾을 수 없습니다: ${fileBaseName}`
    );
  }
};

const watcher = chokidar.watch(
  "/Users/aeonapsychelovelace/Downloads/ESMP/upload",
  {
    ignored: /(^|[\/\\])\../, // .DS_Store 파일 무시
    persistent: true,
  }
);

watcher
  .on("add", (filePath) => {
    const fileName = path.basename(filePath);
    const fileBaseName = path.parse(fileName).name;
    if (fileName !== ".DS_Store") {
      console.log(`파일 추가 감지: ${filePath}`);
      createOrUpdatePage(fileBaseName);
    }
  })
  .on("unlink", (filePath) => {
    const fileName = path.basename(filePath);
    const fileBaseName = path.parse(fileName).name; // 확장자를 제거한 파일 이름
    if (fileName !== ".DS_Store") {
      console.log(`파일 삭제 감지: ${filePath}`);
      archivePage(fileBaseName);
    }
  });

const uploadExistingFiles = (folderPath) => {
  fs.readdir(folderPath, (err, files) => {
    if (err) {
      console.error(`폴더 읽기 중 오류 발생: ${err}`);
      return;
    }
    files.forEach((fileName) => {
      if (fileName !== ".DS_Store") {
        const filePath = path.join(folderPath, fileName);
        if (fs.lstatSync(filePath).isFile()) {
          const fileBaseName = path.parse(fileName).name;
          createOrUpdatePage(fileBaseName);
        }
      }
    });
  });
};

uploadExistingFiles("/Users/aeonapsychelovelace/Downloads/ESMP/upload");
