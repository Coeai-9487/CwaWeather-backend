require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CWA 支援的 22 縣市列表 (用於 API 文件和前端參考)
const AVAILABLE_CITIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
  "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣", "南投縣",
  "雲林縣", "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
  "臺東縣", "澎湖縣", "金門縣", "連江縣"
];

/**
 * 取得指定城市天氣預報 (通用化函數)
 * 接受路徑參數 :city
 */
const getWeatherByCity = async (req, res) => {
  try {
    // 【修改點 1 & 2】從路由參數中動態取得城市名稱
    const cityName = req.params.city;

    // 檢查是否提供城市名稱
    if (!cityName) {
      // 由於路由已經是 /api/weather/:city，如果沒有 :city 會走 404
      // 但我們保留檢查，以防路由設計變動
      return res.status(400).json({
        error: "參數錯誤",
        message: "請提供城市名稱參數",
      });
    }
    
    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 呼叫 CWA API - 一般天氣預報（36小時）
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: cityName, // 【修改點 3】使用動態變數 cityName
        },
      }
    );

    // 取得指定城市的天氣資料
    // CWA API 回應的 location 陣列中，第一個元素就是我們需要的
    const locationData = response.data.records.location[0];

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得 ${cityName} 天氣資料，請確認城市名稱是否正確`,
      });
    }

    // 整理天氣資料 (後續邏輯不變，保持得很好！)
    const weatherData = {
      city: locationData.locationName,
      // CWA API 的資料集描述通常就是更新時間的說明
      updateTimeDescription: response.data.records.datasetDescription, 
      forecasts: [],
    };
    
    // 解析天氣要素... (這部分保持不變)
    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {
        startTime: weatherElements[0].time[i].startTime,
        endTime: weatherElements[0].time[i].endTime,
        weather: "",
        rain: "",
        minTemp: "",
        maxTemp: "",
        comfort: "",
        windSpeed: "",
      };

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        switch (element.elementName) {
          case "Wx":
            forecast.weather = value.parameterName;
            break;
          case "PoP":
            forecast.rain = value.parameterName + "%";
            break;
          case "MinT":
            forecast.minTemp = value.parameterName + "°C";
            break;
          case "MaxT":
            forecast.maxTemp = value.parameterName + "°C";
            break;
          case "CI":
            forecast.comfort = value.parameterName;
            break;
          case "WS":
            forecast.windSpeed = value.parameterName;
            break;
        }
      });

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      // API 回應錯誤
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    // 其他錯誤
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

// ===============================================
// ROUTE 定義
// ===============================================

// 根路由 (API 文件/服務發現)
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API - 服務根目錄",
    endpoints: {
      weatherByCity: "/api/weather/:city",
      health: "/api/health",
      availableCities: "/api/cities" // 新增城市列表路由
    },
    usage: {
      description: "使用路徑參數取得指定城市天氣預報 (請使用 AVAILABLE_CITIES 中的名稱)",
      examples: [
        "/api/weather/臺中市",
        "/api/weather/高雄市",
        "/api/weather/臺北市"
      ],
    },
  });
});

// 健康檢查路由
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 新增路由：回傳可用城市列表 (供前端動態生成下拉選單使用)
app.get("/api/cities", (req, res) => {
  res.json({
      success: true,
      data: AVAILABLE_CITIES
  });
});


// 【修改點 4】取得指定城市天氣預報（使用路徑參數 :city）
// 這是我們實現動態城市查詢的核心路由
app.get("/api/weather/:city", getWeatherByCity);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作: http://localhost:${PORT}`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});