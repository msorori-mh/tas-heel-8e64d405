/* Instrumentation only: two verified packs in the real native file/cache formats. */
(async () => {
  const owner = "00000000-0000-4000-8000-000000000092";
  const grade = "00000000-0000-4000-8000-000000000093";
  const now = new Date().toISOString();
  const native = (plugin, method, data) => Capacitor.nativePromise(plugin, method, data);
  const digest = async (text) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  const canonical = (v) =>
    Array.isArray(v)
      ? `[${v.map(canonical).join(",")}]`
      : v && typeof v === "object"
        ? `{${Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, value]) => JSON.stringify(k) + ":" + canonical(value))
            .join(",")}}`
        : JSON.stringify(v);
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open("tamkeen-offline-artifacts", 1);
    r.onupgradeneeded = () => {
      for (const key of ["artifact-bytes", "artifact-meta"])
        if (!r.result.objectStoreNames.contains(key)) r.result.createObjectStore(key);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const packs = [];
  for (const [id, name, title] of [
    ["biology", "الأحياء", "الخلية الحية"],
    ["chemistry", "الكيمياء", "التفاعلات الكيميائية"],
  ]) {
    const body = `<!doctype html><html dir="rtl" lang="ar"><body><h1>${title}</h1><p>محتوى ${name} المحفوظ يعمل في واجهة الدرس المعتادة.</p></body></html>`;
    const artifact = {
      artifactId: `official-book:${id}`,
      resourceId: `official-book:${id}`,
      kind: "lesson-html",
      lessonId: `lesson-${id}`,
      lessonTitle: title,
      title,
      relativePath: `packs/${id}.html`,
      contentType: "text/html",
      byteSize: new TextEncoder().encode(body).length,
      sha256: await digest(body),
      sortOrder: 0,
    };
    const bodies = [[artifact, body]];
    if (id === "biology") {
      const extra = [
        [
          "mind-map:fixture-map",
          "lesson-html",
          "خريطة الخلية",
          '<html dir="rtl"><body><h1>خريطة الخلية المحفوظة</h1></body></html>',
        ],
        [
          "lab-experiment:fixture-lab",
          "lesson-html",
          "تجربة الخلية",
          '<html dir="rtl"><body><button id="run" onclick="this.textContent=\'نجحت التجربة\'">شغّل التجربة</button><script>parent.postMessage({type:"fixture-lab-ready"},"*");</script></body></html>',
        ],
        [
          "self-test:lesson-biology",
          "self-test",
          "اختبر فهمك",
          JSON.stringify({
            schemaVersion: 1,
            kind: "self-test",
            lessonId: "lesson-biology",
            questions: [
              {
                questionId: "fixture-question",
                revisionId: "fixture-revision",
                questionText: "ما الوحدة الأساسية للحياة؟",
                questionType: "mcq",
                sortOrder: 0,
                options: [
                  { id: "a", text: "الخلية", sortOrder: 0 },
                  { id: "b", text: "الصخرة", sortOrder: 1 },
                ],
                correctOptionId: "a",
                explanation: "الخلية هي الوحدة الأساسية للحياة.",
                feedbackByOption: {
                  a: { whyCorrect: "أحسنت", whyWrong: null },
                  b: { whyCorrect: null, whyWrong: "راجع الدرس" },
                },
              },
            ],
          }),
        ],
      ];
      for (const [resourceId, kind, title, content] of extra) {
        bodies.push([
          {
            ...artifact,
            artifactId: resourceId,
            resourceId,
            kind,
            title,
            relativePath: `packs/${resourceId.replace(/:/g, "-")}.txt`,
            contentType: kind === "self-test" ? "application/json" : "text/html",
            byteSize: new TextEncoder().encode(content).length,
            sha256: await digest(content),
            sortOrder: bodies.length,
          },
          content,
        ]);
      }
    }
    const manifest = {
      schemaVersion: 1,
      packId: `subject-${id}`,
      revision: 1,
      generatedAt: now,
      scope: {
        gradeId: grade,
        curriculumTrackId: grade,
        semester: 1,
        subjectId: id,
        subjectTitle: name,
      },
      artifacts: bodies.map(([item]) => item),
    };
    packs.push({
      ownerId: owner,
      manifest,
      manifestSha256: await digest(canonical(manifest)),
      status: "ready",
      verifiedArtifactIds: bodies.map(([item]) => item.artifactId),
      downloadedBytes: bodies.reduce((sum, [item]) => sum + item.byteSize, 0),
      lastErrorCode: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const [artifact, body] of bodies) {
      await native("Filesystem", "writeFile", {
        directory: "DATA",
        path: `tamkeen/offline-artifacts/${owner}/${artifact.relativePath}`,
        recursive: true,
        encoding: "utf8",
        data: body,
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("artifact-meta", "readwrite");
        tx.objectStore("artifact-meta").put(
          {
            ownerId: owner,
            artifactId: artifact.artifactId,
            relativePath: artifact.relativePath,
            contentType: artifact.contentType,
            byteSize: artifact.byteSize,
            sha256: artifact.sha256,
          },
          `${owner}\0${artifact.artifactId}`,
        );
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
  }
  db.close();
  await native("Filesystem", "writeFile", {
    directory: "DATA",
    path: "tamkeen/offline/foundation-v1.json",
    recursive: true,
    encoding: "utf8",
    data: JSON.stringify({
      schemaVersion: 1,
      updatedAt: now,
      activeOwnerId: owner,
      packs,
      outbox: [],
      learning: [],
    }),
  });
  if (window.__offlineShellLegacySeed) {
    await native("Preferences", "remove", { key: "tamkeen.student-shell.identity.v1" });
    await native("Preferences", "remove", { key: "tamkeen.native-last-space.v1" });
    window.__offlineShellSeed = "ready";
    return;
  }
  await native("Preferences", "set", {
    key: "tamkeen.student-shell.identity.v1",
    value: JSON.stringify({
      version: 1,
      profile: {
        id: owner,
        user_id: owner,
        full_name: "طالبة الاختبار",
        grade_id: 12,
        grade_uuid: grade,
        curriculum_track_id: grade,
        governorate_id: grade,
        school_name: "مدرسة الاختبار",
        governorate: null,
        phone: null,
        avatar_url: null,
      },
    }),
  });
  await native("Preferences", "set", {
    key: "tamkeen.native-last-space.v1",
    value: JSON.stringify({ owner, space: "student" }),
  });
  window.__offlineShellSeed = "ready";
})().catch((error) => {
  window.__offlineShellSeed = "failed:" + error.message;
});
