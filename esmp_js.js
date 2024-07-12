import axios from "axios";
import { storage } from "./firebase.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { equal } from "assert";

dotenv.config();

const notionToken = process.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_DATABASE_ID;
const dirPath = process.env.FOLDER_PATH;

const uploadFileToFirebase = async (filePath, fileName) => {
  try {
    const storageRef = ref(storage, `files/${fileName}.mp3`);
    const fileBuffer = fs.readFileSync(filePath);
    const metadata = {
      contentType: "audio/mpeg",
    };

    const result = await uploadBytes(storageRef, fileBuffer, metadata);
    const downloadURL = await getDownloadURL(result.ref);
    console.log(fileName + "업로드");
    return downloadURL;
  } catch (error) {
    console.error(`파일 업로드 중 오류 발생: ${error}`);
  }
};

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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    id = parts[0].replace("ESMP", "");
    titleParts = parts.slice(1);
  } else {
    id = parts[0];
    titleParts = parts.slice(1);
  }

  let title = titleParts.join("_").trim();
  let statusMatch = title.match(/\((.*?)\)\s*$/);
  let status = statusMatch ? statusMatch[1].replace(/,/g, " ") : "Unknown";

  if (statusMatch) {
    title = title.replace(statusMatch[0], "").trim();
  }

  console.log(`ID: ${id}, Title: ${title}, Status: ${status}`);
  // Notion API 검색 URL
  const searchUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
  const searchPayload = {
    filter: {
      property: "Song",
      title: {
        equals: title, // 'contains'로 변경하여 부분 일치 검색
      },
    },
  };

  // console.log(`검색 페이로드: ${JSON.stringify(searchPayload)}`);

  const maxRetries = 5;
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      const response = await axios.post(searchUrl, searchPayload, {
        headers: notionHeaders,
      });
      const results = response.data.results;

      if (results.length === 0) {
        const filePath = path.join(dirPath, `${fileBaseName}.mp3`);
        console.log(fileBaseName);
        const downloadURL = await uploadFileToFirebase(filePath, fileBaseName);

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
            Link: {
              url: downloadURL,
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
      } else {
        // console.log(`${title}에 대한 페이지가 이미 존재합니다.`);
      }
      break;
    } catch (error) {
      if (error.response) {
        if (error.response.status === 409) {
          attempts++;
          console.error(
            `파일 "${fileBaseName}"에 대해 충돌 발생: ${error.response.status} - ${error.response.statusText}. 재시도 중... (${attempts}/${maxRetries})`
          );
          await delay(1000 * attempts);
        } else {
          console.error(
            `파일 "${fileBaseName}"에 대해 API 요청 중 오류 발생: ${error.response.status} - ${error.response.statusText}`
          );
          console.error(
            `오류 응답 데이터: ${JSON.stringify(error.response.data)}`
          );
          break;
        }
      } else {
        console.error(
          `파일 "${fileBaseName}"에 대해 API 요청 중 오류 발생: ${error.message}`
        );
        break;
      }
    }
  }

  delete processingFiles[fileBaseName];
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

  await Promise.all(
    filesInFolder.map(async (fileBaseName) => {
      const normalizedFileBaseName = fileBaseName.normalize("NFC");
      // console.log("testNormal: ", normalizedFileBaseName);
      await createOrUpdatePage(normalizedFileBaseName);
    })
  );
};

uploadExistingFiles(dirPath);
