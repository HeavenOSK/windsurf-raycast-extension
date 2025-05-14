import { ActionPanel, Action, Icon, List, showToast, Toast, closeMainWindow } from "@raycast/api";
import { useEffect, useState } from "react";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import os from 'os'

const execAsync = promisify(exec);

// Windsurfのメニューアイテムの型定義
interface MenuItem {
  id: string;
  label: string;
  uri?: {
    $mid: number;
    path: string;
    scheme: string;
  },
  submenu?: {
    items: MenuItem[];
  };
}

interface FileMenu {
  items: MenuItem[];
}

interface MenubarData {
  menus: {
    File: FileMenu;
  };
}

interface StorageData {
  lastKnownMenubarData: MenubarData;
}

interface RecentProject {
  uri: string;
  label: string;
  path: string;
}

// Windsurfストレージファイルのパス
const STORAGE_FILE_PATH = ()=> `${os.homedir()}/Library/Application Support/Windsurf/User/globalStorage/storage.json`;

// プロジェクトをWindsurfで開く関数
async function openProjectInWindsurf(projectPath: string) {
  try {
    await execAsync(`open -a Windsurf "${projectPath}"`);
    await showToast({
      style: Toast.Style.Success,
      title: "プロジェクトを開きました",
    });
    
    // プロジェクトを開いた後、Raycast Extensionを終了
    await closeMainWindow();
  } catch (error) {
    console.error("Failed to open project:", error);
    await showToast({
      style: Toast.Style.Failure,
      title: "エラー",
      message: "プロジェクトを開けませんでした",
    });
  }
}

// Windsurfの最近使用したプロジェクトを取得する関数
function getRecentProjects(): RecentProject[] {
  try {
    // ストレージファイルが存在するか確認
    if (!fs.existsSync(STORAGE_FILE_PATH())) {
      console.error("Storage file not found:", STORAGE_FILE_PATH());
      return [];
    }

    // ストレージファイルを読み込む
    const storageData = JSON.parse(fs.readFileSync(STORAGE_FILE_PATH(), "utf8"));
    
    // メニューデータの取得
    const storageDataTyped = storageData as StorageData;
    const fileMenu = storageDataTyped.lastKnownMenubarData?.menus?.File?.items;
    if (!fileMenu) {
      console.error("File menu not found in storage data");
      return [];
    }

    // 「Open Recent」メニューアイテムを探す
    const recentMenuItem = fileMenu.find(
      (item: MenuItem) =>
        item.id === "submenuitem.MenubarRecentMenu" &&
        item.label === "Open &&Recent"
    );

    if (!recentMenuItem || !recentMenuItem.submenu?.items) {
      console.error("Recent menu items not found");
      return [];
    }

    // デバッグ用にデータ構造をコンソールに出力
    console.log("Recent menu items:", JSON.stringify(recentMenuItem.submenu.items, null, 2));

    // 最近使用したプロジェクトのリストを取得
    return recentMenuItem.submenu.items
      .filter((item)=> item.id === 'openRecentFolder')
      .filter((item: MenuItem) => {
        // アイテムにuriプロパティがあり、それが文字列かどうかを確認
        return item.uri && typeof item.uri === "object";
      })
      .map((item: MenuItem) => {
        // URIからファイルパスを抽出（file:///path/to/projectからpath/to/projectを取得）
        const uri = item.uri as { $mid: number; path: string; scheme: string; };
        const filePath = uri.path;
        return {
          uri: uri.path,
          label: item.label.split('/').pop() || '',
          path: filePath,
        };
      });
  } catch (error) {
    console.error("Error reading recent projects:", error);
    return [];
  }
}

export default function Command() {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const projects = getRecentProjects();
    setRecentProjects(projects);
    setIsLoading(false);
  }, []);

  return (
    <List isLoading={isLoading}>
      {recentProjects.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.XmarkCircle}
          title="最近使用したプロジェクトがありません"
          description="Windsurfでプロジェクトを開くと、ここに表示されます"
        />
      ) : (
        recentProjects.map((project, index) => (
          <List.Item
            key={index}
            icon={Icon.Folder}
            title={project.label}
            subtitle={project.path}
            actions={
              <ActionPanel>
                <Action
                  title="プロジェクトを開く"
                  icon={Icon.ArrowRight}
                  onAction={() => openProjectInWindsurf(project.path)}
                />
                <Action.CopyToClipboard
                  title="パスをコピー"
                  content={project.path}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
