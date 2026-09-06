const innosetup = require('../electron/node_modules/innosetup-compiler');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const ELECTRON_DIR = path.resolve(ROOT_DIR, 'desktop/electron');
const OUT_DIST_DIR = path.resolve(ELECTRON_DIR, 'out_dist');
const MAKE_DIR = path.resolve(OUT_DIST_DIR, 'make');
const APP_DIR = path.resolve(OUT_DIST_DIR, 'CloudSync-win32-x64');
const ICON_PATH = path.resolve(ELECTRON_DIR, 'assets/icon.ico');

function buildWindowsWizardInstaller() {
  return new Promise((resolve, reject) => {
    console.log('\n=== Generating Windows Standard Setup Wizard (Inno Setup) ===');

    if (!fs.existsSync(APP_DIR)) {
      return reject(new Error(`Packaged application directory not found: ${APP_DIR}`));
    }

    fs.mkdirSync(MAKE_DIR, { recursive: true });

    const issPath = path.join(ELECTRON_DIR, 'installer.iss');
    const issScript = `
[Setup]
AppId={{C604473F-92DF-4392-BD2D-08209DE56BE8}
AppName=CloudSync
AppVersion=1.0.0
AppPublisher=Virendra Phirke
AppPublisherURL=https://cloud-sync-woad.vercel.app
AppSupportURL=https://cloud-sync-woad.vercel.app
AppUpdatesURL=https://cloud-sync-woad.vercel.app
DefaultDirName={autopf}\\CloudSync
DefaultGroupName=CloudSync
DisableProgramGroupPage=no
DisableDirPage=no
UsePreviousAppDir=no
DirExistsWarning=no
CloseApplications=force
RestartApplications=no
OutputDir=${MAKE_DIR}
OutputBaseFilename=CloudSync-Windows-Setup-Wizard
SetupIconFile=${ICON_PATH}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
AllowNoIcons=yes
UninstallDisplayIcon={app}\\CloudSync.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "${APP_DIR}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\\CloudSync"; Filename: "{app}\\CloudSync.exe"
Name: "{group}\\{cm:UninstallProgram,CloudSync}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\\CloudSync"; Filename: "{app}\\CloudSync.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\\CloudSync.exe"; Description: "{cm:LaunchProgram,CloudSync}"; Flags: nowait postinstall skipifsilent
`;

    fs.writeFileSync(issPath, issScript.trim());
    console.log(' Generated Inno Setup script: desktop/electron/installer.iss');

    innosetup(issPath, { gui: false, verbose: false }, (err) => {
      if (err) {
        return reject(err);
      }
      const outputInstaller = path.join(MAKE_DIR, 'CloudSync-Windows-Setup-Wizard.exe');
      if (fs.existsSync(outputInstaller)) {
        const standardSetup = path.join(MAKE_DIR, 'CloudSync-Setup.exe');
        try {
          fs.copyFileSync(outputInstaller, standardSetup);
        } catch {}
        const stats = fs.statSync(outputInstaller);
        const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`\n Successfully generated Windows Standard Setup Wizard:`);
        console.log(` - ${path.relative(ROOT_DIR, outputInstaller).replace(/\\/g, '/')} (${sizeMb} MB)`);
        console.log(` - ${path.relative(ROOT_DIR, standardSetup).replace(/\\/g, '/')} (${sizeMb} MB)`);
        resolve(outputInstaller);
      } else {
        reject(new Error('Installer compilation completed but output executable was not found.'));
      }
    });
  });
}

if (require.main === module) {
  buildWindowsWizardInstaller().catch((err) => {
    console.error('Failed to build Windows Setup Wizard:', err);
    process.exit(1);
  });
}

module.exports = { buildWindowsWizardInstaller };
