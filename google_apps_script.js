// ============================================
// FitBurn — Google Apps Script 雲端後端
// ============================================
// 
// 📌 使用方式：
// 1. 開啟你的 Google Sheets（上方的網址）
// 2. 點選「擴充功能」→「Apps Script」
// 3. 把這個檔案的全部內容複製貼上到 Apps Script 編輯器
// 4. 點選「部署」→「新增部署」
// 5. 類型選「網頁應用程式」
// 6.「誰可以存取」選「任何人」
// 7. 點選「部署」，複製產生的網址
// 8. 把網址貼到 FitBurn 的設定中
//
// ⚠️ 注意：首次部署需要授權存取 Google Sheets
// ============================================

const SPREADSHEET_ID = '1hIdFl-N1k57CbuXPT4nU8fwkDlhM9e9vNBKKH88tID0';

// ===== 初始化工作表 =====
function initSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  const sheets = {
    'Users':     ['userId', 'gender', 'age', 'height', 'weight', 'activity', 'goal', 'apiKey', 'createdAt', 'updatedAt'],
    'Foods':     ['userId', 'date', 'id', 'name', 'portion', 'calories', 'time', 'imageData'],
    'Exercises': ['userId', 'date', 'id', 'type', 'typeName', 'emoji', 'duration', 'distance', 'calories', 'time'],
    'WeightLog': ['userId', 'date', 'weight'],
    'WaterLog':  ['userId', 'date', 'amount'],
    'History':   ['userId', 'date', 'totalIntake', 'totalBurn', 'targetCalories', 'netCalories', 'note']
  };
  
  for (const [name, headers] of Object.entries(sheets)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  
  return ss;
}

// ===== HTTP 處理 =====
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    let postData = {};
    
    if (e.postData) {
      try { postData = JSON.parse(e.postData.contents); } catch(err) {}
    }
    
    // Merge params — POST body takes priority
    const data = { ...params, ...postData };
    const action = data.action || '';
    
    let result;
    
    switch (action) {
      case 'register':    result = registerUser(data); break;
      case 'login':       result = loginUser(data); break;
      case 'saveProfile': result = saveProfile(data); break;
      case 'getProfile':  result = getProfile(data); break;
      case 'saveFood':    result = saveFood(data); break;
      case 'deleteFood':  result = deleteFood(data); break;
      case 'saveExercise':    result = saveExercise(data); break;
      case 'deleteExercise':  result = deleteExercise(data); break;
      case 'saveWeight':  result = saveWeight(data); break;
      case 'saveWater':   result = saveWater(data); break;
      case 'getDayData':  result = getDayData(data); break;
      case 'getHistory':  result = getHistory(data); break;
      case 'getWeightHistory': result = getWeightHistory(data); break;
      case 'getEncouragement': result = getEncouragement(data); break;
      case 'syncAll':     result = syncAll(data); break;
      default: result = { success: false, error: 'Unknown action: ' + action };
    }
    
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== 使用者管理 =====
function registerUser(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('Users');
  const userId = data.userId;
  
  if (!userId || userId.length < 2) {
    return { success: false, error: '使用者 ID 至少需要 2 個字元' };
  }
  
  // Check if exists
  const existing = findRow(sheet, 0, userId);
  if (existing >= 0) {
    return { success: false, error: '此 ID 已被使用' };
  }
  
  const now = new Date().toISOString();
  sheet.appendRow([
    userId,
    data.gender || '',
    data.age || 0,
    data.height || 0,
    data.weight || 0,
    data.activity || 'moderate',
    data.goal || 'moderate',
    data.apiKey || '',
    now,
    now
  ]);
  
  return { success: true, userId: userId, message: '註冊成功！' };
}

function loginUser(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('Users');
  const userId = data.userId;
  
  if (!userId) return { success: false, error: '請輸入使用者 ID' };
  
  const row = findRow(sheet, 0, userId);
  if (row < 0) return { success: false, error: '找不到此使用者，請先註冊' };
  
  const values = sheet.getRange(row + 1, 1, 1, 10).getValues()[0];
  
  return {
    success: true,
    profile: {
      userId: values[0],
      gender: values[1],
      age: values[2],
      height: values[3],
      weight: values[4],
      activity: values[5],
      goal: values[6],
      apiKey: values[7]
    }
  };
}

// ===== 個人資料 =====
function saveProfile(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('Users');
  const row = findRow(sheet, 0, data.userId);
  
  if (row < 0) return { success: false, error: '使用者不存在' };
  
  const now = new Date().toISOString();
  sheet.getRange(row + 1, 1, 1, 10).setValues([[
    data.userId,
    data.gender || '',
    data.age || 0,
    data.height || 0,
    data.weight || 0,
    data.activity || 'moderate',
    data.goal || 'moderate',
    data.apiKey || '',
    sheet.getRange(row + 1, 9).getValue(), // keep createdAt
    now
  ]]);
  
  return { success: true };
}

function getProfile(data) {
  return loginUser(data);
}

// ===== 食物紀錄 =====
function saveFood(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('Foods');
  
  // 圖片資料如果太長就截斷（Sheets 每格上限 50000 chars）
  let imageData = data.imageData || '';
  if (imageData.length > 45000) imageData = imageData.substring(0, 45000);
  
  sheet.appendRow([
    data.userId,
    data.date,
    data.id,
    data.name || '',
    data.portion || '',
    data.calories || 0,
    data.time || '',
    imageData
  ]);
  
  updateHistory(ss, data.userId, data.date);
  return { success: true };
}

function deleteFood(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('Foods');
  const allData = sheet.getDataRange().getValues();
  
  for (let i = allData.length - 1; i >= 1; i--) {
    if (allData[i][0] === data.userId && allData[i][2] === data.id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  
  updateHistory(ss, data.userId, data.date);
  return { success: true };
}

// ===== 運動紀錄 =====
function saveExercise(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('Exercises');
  
  sheet.appendRow([
    data.userId,
    data.date,
    data.id,
    data.type || '',
    data.typeName || '',
    data.emoji || '',
    data.duration || 0,
    data.distance || '',
    data.calories || 0,
    data.time || ''
  ]);
  
  updateHistory(ss, data.userId, data.date);
  return { success: true };
}

function deleteExercise(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('Exercises');
  const allData = sheet.getDataRange().getValues();
  
  for (let i = allData.length - 1; i >= 1; i--) {
    if (allData[i][0] === data.userId && allData[i][2] === data.id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  
  updateHistory(ss, data.userId, data.date);
  return { success: true };
}

// ===== 體重 =====
function saveWeight(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('WeightLog');
  
  // Upsert: find existing row for this user+date
  const allData = sheet.getDataRange().getValues();
  let found = -1;
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === data.userId && allData[i][1] === data.date) {
      found = i;
      break;
    }
  }
  
  if (found >= 0) {
    sheet.getRange(found + 1, 3).setValue(data.weight);
  } else {
    sheet.appendRow([data.userId, data.date, data.weight]);
  }
  
  // Also update profile weight
  const usersSheet = ss.getSheetByName('Users');
  const userRow = findRow(usersSheet, 0, data.userId);
  if (userRow >= 0) {
    usersSheet.getRange(userRow + 1, 5).setValue(data.weight);
  }
  
  return { success: true };
}

// ===== 飲水 =====
function saveWater(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('WaterLog');
  
  const allData = sheet.getDataRange().getValues();
  let found = -1;
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === data.userId && allData[i][1] === data.date) {
      found = i;
      break;
    }
  }
  
  if (found >= 0) {
    sheet.getRange(found + 1, 3).setValue(data.amount);
  } else {
    sheet.appendRow([data.userId, data.date, data.amount]);
  }
  
  return { success: true };
}

// ===== 取得單日資料 =====
function getDayData(data) {
  const ss = initSheets();
  
  // Foods
  const foodSheet = ss.getSheetByName('Foods');
  const foodData = foodSheet.getDataRange().getValues();
  const foods = [];
  for (let i = 1; i < foodData.length; i++) {
    if (foodData[i][0] === data.userId && foodData[i][1] === data.date) {
      foods.push({
        id: foodData[i][2],
        name: foodData[i][3],
        portion: foodData[i][4],
        calories: foodData[i][5],
        time: foodData[i][6],
        imageUrl: foodData[i][7] || ''
      });
    }
  }
  
  // Exercises
  const exSheet = ss.getSheetByName('Exercises');
  const exData = exSheet.getDataRange().getValues();
  const exercises = [];
  for (let i = 1; i < exData.length; i++) {
    if (exData[i][0] === data.userId && exData[i][1] === data.date) {
      exercises.push({
        id: exData[i][2],
        type: exData[i][3],
        typeName: exData[i][4],
        emoji: exData[i][5],
        duration: exData[i][6],
        distance: exData[i][7],
        calories: exData[i][8],
        time: exData[i][9]
      });
    }
  }
  
  // Water
  const waterSheet = ss.getSheetByName('WaterLog');
  const waterData = waterSheet.getDataRange().getValues();
  let water = 0;
  for (let i = 1; i < waterData.length; i++) {
    if (waterData[i][0] === data.userId && waterData[i][1] === data.date) {
      water = waterData[i][2];
    }
  }
  
  return { success: true, foods, exercises, water };
}

// ===== 歷史紀錄 =====
function getHistory(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('History');
  const allData = sheet.getDataRange().getValues();
  
  const days = parseInt(data.days) || 30;
  const history = [];
  
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === data.userId) {
      history.push({
        date: allData[i][1],
        totalIntake: allData[i][2],
        totalBurn: allData[i][3],
        targetCalories: allData[i][4],
        netCalories: allData[i][5],
        note: allData[i][6]
      });
    }
  }
  
  // Sort by date desc, limit
  history.sort((a, b) => b.date.localeCompare(a.date));
  return { success: true, history: history.slice(0, days) };
}

function getWeightHistory(data) {
  const ss = initSheets();
  const sheet = ss.getSheetByName('WeightLog');
  const allData = sheet.getDataRange().getValues();
  
  const logs = [];
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] === data.userId) {
      logs.push({ date: allData[i][1], weight: allData[i][2] });
    }
  }
  
  logs.sort((a, b) => a.date.localeCompare(b.date));
  return { success: true, logs };
}

// ===== 鼓勵訊息 =====
function getEncouragement(data) {
  const ss = initSheets();
  
  // Get weight history
  const weightSheet = ss.getSheetByName('WeightLog');
  const wData = weightSheet.getDataRange().getValues();
  const weights = [];
  for (let i = 1; i < wData.length; i++) {
    if (wData[i][0] === data.userId) weights.push({ date: wData[i][1], weight: wData[i][2] });
  }
  weights.sort((a, b) => a.date.localeCompare(b.date));
  
  // Get recent history
  const histSheet = ss.getSheetByName('History');
  const hData = histSheet.getDataRange().getValues();
  const recent = [];
  for (let i = 1; i < hData.length; i++) {
    if (hData[i][0] === data.userId) recent.push({ date: hData[i][1], intake: hData[i][2], burn: hData[i][3], target: hData[i][4] });
  }
  recent.sort((a, b) => b.date.localeCompare(a.date));
  const last7 = recent.slice(0, 7);
  
  // Build encouragement
  const msgs = [];
  
  // Weight trend
  if (weights.length >= 2) {
    const first = weights[0].weight;
    const last = weights[weights.length - 1].weight;
    const diff = (last - first).toFixed(1);
    if (diff < 0) {
      msgs.push(`🎉 太棒了！你已經減了 ${Math.abs(diff)} kg，從 ${first} kg 到 ${last} kg！繼續保持！`);
    } else if (diff > 0) {
      msgs.push(`💪 體重增加了 ${diff} kg，但別灰心！持續記錄就是最好的開始。`);
    } else {
      msgs.push(`⚖️ 體重維持穩定，保持健康的生活方式！`);
    }
    
    // Recent trend (last 7 days)
    if (weights.length >= 3) {
      const recentWeights = weights.slice(-7);
      if (recentWeights.length >= 2) {
        const rFirst = recentWeights[0].weight;
        const rLast = recentWeights[recentWeights.length - 1].weight;
        if (rLast < rFirst) {
          msgs.push(`📉 近期體重持續下降中，你做得很好！`);
        }
      }
    }
  }
  
  // Record streak
  if (last7.length > 0) {
    msgs.push(`📊 你已經持續記錄了 ${recent.length} 天，堅持就是力量！`);
    
    // Calorie discipline
    const underTarget = last7.filter(d => d.intake <= d.target).length;
    if (underTarget >= 5) {
      msgs.push(`🏆 過去 7 天有 ${underTarget} 天達成熱量目標，超級厲害！`);
    } else if (underTarget >= 3) {
      msgs.push(`👍 過去 7 天有 ${underTarget} 天達成目標，再加把勁！`);
    }
    
    // Exercise frequency
    const exerciseDays = last7.filter(d => d.burn > 0).length;
    if (exerciseDays >= 5) {
      msgs.push(`🔥 過去 7 天有 ${exerciseDays} 天有運動，你是運動達人！`);
    } else if (exerciseDays >= 3) {
      msgs.push(`🏃 過去 7 天有 ${exerciseDays} 天有運動，繼續保持！`);
    } else {
      msgs.push(`🚶 試著每天做一點運動吧，即使只是走路也很有幫助！`);
    }
  }
  
  if (msgs.length === 0) {
    msgs.push('🌟 開始記錄你的第一天吧！每一步都很重要！');
  }
  
  return { success: true, messages: msgs, totalDays: recent.length, totalWeightLogs: weights.length };
}

// ===== 全量同步 =====
function syncAll(data) {
  const ss = initSheets();
  const userId = data.userId;
  
  if (data.records) {
    for (const [date, rec] of Object.entries(data.records)) {
      // Save foods
      if (rec.foods) {
        for (const food of rec.foods) {
          // Check if already exists
          const foodSheet = ss.getSheetByName('Foods');
          const fData = foodSheet.getDataRange().getValues();
          let exists = false;
          for (let i = 1; i < fData.length; i++) {
            if (fData[i][0] === userId && fData[i][2] === food.id) { exists = true; break; }
          }
          if (!exists) {
            let imgData = food.imageUrl || '';
            if (imgData.length > 45000) imgData = imgData.substring(0, 45000);
            foodSheet.appendRow([userId, date, food.id, food.name, food.portion || '', food.calories, food.time || '', imgData]);
          }
        }
      }
      
      // Save exercises
      if (rec.exercises) {
        for (const ex of rec.exercises) {
          const exSheet = ss.getSheetByName('Exercises');
          const eData = exSheet.getDataRange().getValues();
          let exists = false;
          for (let i = 1; i < eData.length; i++) {
            if (eData[i][0] === userId && eData[i][2] === ex.id) { exists = true; break; }
          }
          if (!exists) {
            exSheet.appendRow([userId, date, ex.id, ex.type, ex.typeName || '', ex.emoji || '', ex.duration, ex.distance || '', ex.calories, ex.time || '']);
          }
        }
      }
      
      updateHistory(ss, userId, date);
    }
  }
  
  // Sync weight logs
  if (data.weightLog) {
    for (const log of data.weightLog) {
      saveWeight({ userId, date: log.date, weight: log.weight });
    }
  }
  
  // Sync water logs
  if (data.waterLog) {
    for (const [date, amount] of Object.entries(data.waterLog)) {
      saveWater({ userId, date, amount });
    }
  }
  
  return { success: true, message: '同步完成！' };
}

// ===== 輔助函式 =====
function findRow(sheet, colIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][colIndex] === value) return i;
  }
  return -1;
}

function updateHistory(ss, userId, date) {
  // Calculate totals for this date
  const foodSheet = ss.getSheetByName('Foods');
  const fData = foodSheet.getDataRange().getValues();
  let totalIntake = 0;
  for (let i = 1; i < fData.length; i++) {
    if (fData[i][0] === userId && fData[i][1] === date) {
      totalIntake += (Number(fData[i][5]) || 0);
    }
  }
  
  const exSheet = ss.getSheetByName('Exercises');
  const eData = exSheet.getDataRange().getValues();
  let totalBurn = 0;
  for (let i = 1; i < eData.length; i++) {
    if (eData[i][0] === userId && eData[i][1] === date) {
      totalBurn += (Number(eData[i][8]) || 0);
    }
  }
  
  // Get user target
  const usersSheet = ss.getSheetByName('Users');
  const userRow = findRow(usersSheet, 0, userId);
  let targetCalories = 1800;
  // (simplified — client should pass target if available)
  
  const net = totalIntake - totalBurn;
  
  // Upsert history
  const histSheet = ss.getSheetByName('History');
  const hData = histSheet.getDataRange().getValues();
  let found = -1;
  for (let i = 1; i < hData.length; i++) {
    if (hData[i][0] === userId && hData[i][1] === date) { found = i; break; }
  }
  
  if (found >= 0) {
    histSheet.getRange(found + 1, 3, 1, 4).setValues([[totalIntake, totalBurn, targetCalories, net]]);
  } else {
    histSheet.appendRow([userId, date, totalIntake, totalBurn, targetCalories, net, '']);
  }
}

// ===== 測試函式 =====
function testInit() {
  initSheets();
  Logger.log('工作表初始化完成！');
}
