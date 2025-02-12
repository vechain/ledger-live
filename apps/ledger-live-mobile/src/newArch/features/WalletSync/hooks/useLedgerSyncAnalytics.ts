import { track } from "~/analytics";

export enum AnalyticsPage {
  ActivateLedgerSync = "Activate Ledger Sync",
  ChooseSyncMethod = "Choose sync method",
  BackupCreationSuccess = "Backup creation success",
  SyncSuccess = "Sync success",
  ScanQRCode = "Scan QR code",
  ShowQRCode = "Show QR code",
  SyncWithQrCode = "Sync with QR code",
  PinCode = "Pin code",
  PinCodesDoNotMatch = "Pin codes don't match",
  Loading = "Loading",
  SettingsGeneral = "Settings General",
  LedgerSyncSettings = "Ledger Sync Settings",
  ManageSyncInstances = "Manage synchronized instances",
  RemoveInstanceWrongDevice = "Remove instance wrong device connected",
  RemoveInstanceSuccess = "Instance removal success",
  ManageBackup = "Manage key",
  ConfirmDeleteBackup = "Confirm delete key",
  DeleteBackupSuccess = "Delete key success",
  SyncWithNoKey = "Sync with no key",
  LedgerSyncActivated = "Ledger Sync activated",
  AutoRemove = "Can’t remove current instance",
  OtherSeed = "You can’t use this Ledger to Sync",
  SameSeed = "App already secured with this Ledger",
  ScanAttemptWithSameBackup = "Scan attempt with same backup",
  ScanAttemptWithDifferentBackups = "Scan attempt with different backups",
  OnBoardingQRCodeNoBackup = "Onboarding no backup detected",
  OnBoardingDeviceNoBackup = "Onboarding this Ledger does not secure a backup",
  OnboardingAccessExistingWallet = "Onboarding access existing wallet",
}

export enum AnalyticsFlow {
  LedgerSync = "Ledger Sync",
}

export enum AnalyticsButton {
  SyncYourAccounts = "Sync your accounts",
  AlreadyCreatedKey = "Already synced a Ledger Live app",
  Close = "Close",
  UseYourLedger = "Use your Ledger",
  ScanQRCode = "Scan a QR code",
  SyncWithAnotherLedgerLive = "Sync with another Ledger Live app",
  ShowQRCode = "Show QR",
  TryAgain = "Try again",
  Synchronize = "Synchronize",
  ManageKey = "Manage key",
  ManageInstances = "Manage instances",
  RemoveInstance = "Remove instance",
  ConnectAnotherLedger = "Connect another Ledger",
  DeleteKey = "Delete key",
  Delete = "Delete",
  Cancel = "Cancel",
  CreateYourKey = "Create your key",
  LedgerSync = "Ledger Sync",
  UseAnother = "Connect another ledger",
  Understand = "I understand",
  TryAnotherLedger = "Try another Ledger",
  ContinueWihtoutSync = "Continue without sync",
}

type OnClickTrack = {
  button: (typeof AnalyticsButton)[keyof typeof AnalyticsButton];
  page: (typeof AnalyticsPage)[keyof typeof AnalyticsPage];
  hasFlow?: boolean;
};

export function useLedgerSyncAnalytics() {
  const onClickTrack = ({ button, page, hasFlow = false }: OnClickTrack) => {
    track("button_clicked", { button, page, flow: hasFlow ? AnalyticsFlow.LedgerSync : undefined });
  };

  return { onClickTrack };
}
