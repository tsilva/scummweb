function normalizeDurationMinutes(skipIntro) {
  const durationMinutes = Number(skipIntro?.durationMinutes);

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  return durationMinutes;
}

function normalizeSaveSlotSkipIntro(skipIntro, durationMinutes) {
  const parsedSlot = Number(skipIntro.slot);
  const slot = Number.isFinite(parsedSlot) && parsedSlot >= 0 ? Math.floor(parsedSlot) : null;
  const saveFiles = Array.isArray(skipIntro.saveFiles)
    ? skipIntro.saveFiles
        .map((fileName) => (typeof fileName === "string" ? fileName.trim() : ""))
        .filter(Boolean)
    : [];

  if (slot === null || saveFiles.length === 0) {
    return null;
  }

  return {
    strategy: "save-slot",
    durationMinutes,
    slot,
    saveFiles: Array.from(new Set(saveFiles)),
  };
}

export function normalizeSkipIntroConfig(skipIntro) {
  if (!skipIntro || typeof skipIntro !== "object") {
    return null;
  }

  const durationMinutes = normalizeDurationMinutes(skipIntro);

  if (durationMinutes === null) {
    return null;
  }

  const parsedStrategy =
    typeof skipIntro.strategy === "string" ? skipIntro.strategy.trim().toLowerCase() : "";
  const hasSaveSlotFields =
    Number.isFinite(Number(skipIntro.slot)) || Array.isArray(skipIntro.saveFiles);

  if (parsedStrategy === "save-slot" || (!parsedStrategy && hasSaveSlotFields)) {
    return normalizeSaveSlotSkipIntro(skipIntro, durationMinutes);
  }

  if (parsedStrategy === "boot-param") {
    const bootParam = Number(skipIntro.bootParam);
    return Number.isSafeInteger(bootParam) && bootParam > 0
      ? { strategy: "boot-param", durationMinutes, bootParam }
      : null;
  }

  return null;
}

export function buildSkipIntroLaunchSrc(src, target, skipIntro, baseUrl) {
  const config = normalizeSkipIntroConfig(skipIntro);
  if (!config) throw new Error("Invalid skip-intro launch configuration");
  const url = new URL(src, baseUrl);
  if (config.strategy === "save-slot") {
    url.searchParams.set("skipIntroTarget", target);
    url.hash = `-x ${config.slot} ${target}`;
  } else {
    url.searchParams.delete("skipIntroTarget");
    url.hash = `-b ${config.bootParam} ${target}`;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
