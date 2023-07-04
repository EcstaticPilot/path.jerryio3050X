import { when, runInAction } from "mobx";
import { SemVer } from "semver";
import { Logger } from "./Logger";
import { APP_VERSION, getAppStores } from "./MainApp";
import { enqueueErrorSnackbar, enqueueSuccessSnackbar } from "../app/Notice";
import * as SWR from "./ServiceWorkerRegistration";
import { onSave } from "./InputOutput";
import { sleep } from "./Util";

const logger = Logger("Versioning");

export async function reportVersions() {
  const { app } = getAppStores();

  const appVersion = APP_VERSION.version;
  const appLatestVersion = app.latestVersion?.version;
  const controllerVersion = await SWR.getCurrentSWVersion();
  const waitingVersion = await SWR.getWaitingSWVersion();

  logger.log(
    `Current versions: app=${appVersion}, latest=${appLatestVersion}, controller SW=${controllerVersion?.version}, waiting SW=${waitingVersion?.version}`
  );
}

export async function fetchLatestVersionViaAPI(): Promise<SemVer | undefined> {
  logger.log("Fetch latest version via API");
  try {
    const reply = await fetch(`${process.env.PUBLIC_URL}/api/version`);
    const version = new SemVer(await reply.text());
    return version;
  } catch (error) {
    logger.error("Error fetching latest version via API:", error);
    return undefined;
  }
}

export async function refreshLatestVersion() {
  return new Promise<void>((resolve, reject) => {
    runInAction(async () => {
      const { app } = getAppStores();

      // Reset to null to indicate that we are fetching the latest version
      app.latestVersion = null;
      // Fetch the latest version, can be undefined indicating that the latest version is not available
      const version = (await SWR.getWaitingSWVersion()) || (await fetchLatestVersionViaAPI());

      runInAction(() => {
        app.latestVersion = version;
        resolve();
      });
    });
  });
}

export async function checkForUpdates() {
  logger.log("Check for updates");

  await SWR.update();
  /*
  ALGO:
  If there is no installing service worker, refreshLatestVersion() will not be called. This is usually because there
  is no update available or the network is down.
  
  We call refreshLatestVersion() manually to check if there is a new version available. It is important so that 
  app.latestVersion is updated. In this case, the method will fetch the latest version via API and update the 
  latestVersion observable. app.latestVersion will probably be undefined if no update available or the network is down
  
  It is also possible that the service worker can not change the state from installing to waiting due to parsing error
  But this is out of our control, so we just ignore it
  */
  if ((await SWR.isInstalling()) === false) {
    await refreshLatestVersion();
  }
}

export async function onLatestVersionChange(newVer: SemVer | null | undefined, oldVer: SemVer | null | undefined) {
  if (newVer === undefined) {
    enqueueErrorSnackbar(logger, "Failed to fetch latest version", 5000);
  } else if (newVer === null) {
    // UX: RFC: Should we show a snackbar when fetching?
    // enqueueSuccessSnackbar(logger, "Fetching latest version", 5000);
  } else {
    /*
    Note: Is it possible that the service worker has an update
    but the version of the application and the waiting service worker are the same?
    */

    const waitingVer = await SWR.getWaitingSWVersion();
    if (newVer.compare(APP_VERSION) !== 0 || waitingVer !== undefined) {
      enqueueSuccessSnackbar(logger, `New version available: ${newVer}`, 5000);

      promptUpdate();
    } else {
      enqueueSuccessSnackbar(logger, "There are currently no updates available", 5000);
    }
  }
}

let isPromptingUpdate = false;

export async function promptUpdate() {
  const { app } = getAppStores();

  if (app.latestVersion === undefined) return;
  if (isPromptingUpdate) return;

  isPromptingUpdate = true;

  await doPromptUpdate();
}

async function doPromptUpdate() {
  if (isPromptingUpdate === false) return;

  const { app, confirmation: conf } = getAppStores();

  if (conf.isOpen) await when(() => conf.isOpen === false);

  const version = app.latestVersion?.version ?? "?.?.?";
  const isModified = app.history.isModified();
  const isModifyingFile = app.mountingFile.isNameSet;

  function getDescription(clientsCount: number) {
    let rtn = "";
    if (clientsCount <= 1) {
      rtn += "Restart the app by closing this tab and reopening it. Reload/Hard Reload will not work.";
    } else {
      rtn += "Restart the app by closing all " + clientsCount + " tabs. Then, reopen them.";
    }

    if (isModified) {
      rtn += " There're unsaved change(s) in the current file, you may save before closing this tab.";
    } else {
      rtn += " There's no unsaved change.";
    }

    return rtn;
  }

  const prompt = conf.prompt({
    title: `Apply Update v${version}`,
    description: getDescription(await SWR.getControllingClientsCount()),
    buttons: isModified
      ? [
          {
            label: "Save",
            color: "success",
            hotkey: "s",
            onClick: () => onSave(app, conf).then(() => conf.close()) // ALGO: Refresh update prompt
          },
          {
            label: "Not Now",
            onClick: () => (isPromptingUpdate = false)
          }
        ]
      : [
          {
            label: "Not Now",
            onClick: () => (isPromptingUpdate = false)
          }
        ]
  });

  const clear = setInterval(async () => {
    conf.description = getDescription(await SWR.getControllingClientsCount());
  }, 1000);

  await prompt;

  clearInterval(clear);

  await sleep(300);

  await doPromptUpdate();
}
