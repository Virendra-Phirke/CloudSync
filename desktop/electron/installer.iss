[Setup]
AppId={{C604473F-92DF-4392-BD2D-08209DE56BE8}
AppName=CloudSync
AppVersion=1.0.0
AppPublisher=Virendra Phirke
AppPublisherURL=https://cloud-sync-woad.vercel.app
AppSupportURL=https://cloud-sync-woad.vercel.app
AppUpdatesURL=https://cloud-sync-woad.vercel.app
DefaultDirName={autopf}\CloudSync
DefaultGroupName=CloudSync
DisableProgramGroupPage=no
DisableDirPage=no
UsePreviousAppDir=no
DirExistsWarning=no
CloseApplications=force
RestartApplications=no
OutputDir=D:\00000 PROJECTS\omnisync\desktop\electron\out_dist\make
OutputBaseFilename=CloudSync-Windows-Setup-Wizard
SetupIconFile=D:\00000 PROJECTS\omnisync\desktop\electron\assets\icon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
AllowNoIcons=yes
UninstallDisplayIcon={app}\CloudSync.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "D:\00000 PROJECTS\omnisync\desktop\electron\out_dist\CloudSync-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\CloudSync"; Filename: "{app}\CloudSync.exe"
Name: "{group}\{cm:UninstallProgram,CloudSync}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\CloudSync"; Filename: "{app}\CloudSync.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\CloudSync.exe"; Description: "{cm:LaunchProgram,CloudSync}"; Flags: nowait postinstall skipifsilent