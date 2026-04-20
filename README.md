# 天惠會館房務管理系統｜Vercel 版

這是一個使用 **React + Vite + TypeScript + Tailwind CSS** 製作的前端專案，可直接部署到 **Vercel**。

## 本機啟動

```bash
npm install
npm run dev
```

## 正式建置

```bash
npm run build
```

## 上傳到 GitHub

### 方法 1：直接用 GitHub 網頁上傳
1. 到 GitHub 建立新 repository
2. 把此專案資料夾內的檔案全部拖上去
3. Commit changes

### 方法 2：使用指令
```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin 你的GitHub倉庫網址
git push -u origin main
```

## 部署到 Vercel
1. 登入 Vercel
2. 選 Add New → Project
3. 選擇 GitHub 上的 repository
4. Framework Preset 保持 Vite
5. Build Command 保持 `npm run build`
6. Output Directory 保持 `dist`
7. 按 Deploy

## 目前版本說明
- 這一版是 **前端靜態展示 / 可互動示意版**
- 目前資料儲存在前端 state，重新整理頁面後不會保留
- 下一步若要正式可用，需要接：
  - 資料庫
  - 登入權限
  - 真正的照片上傳
  - 活動/房間資料永久保存
