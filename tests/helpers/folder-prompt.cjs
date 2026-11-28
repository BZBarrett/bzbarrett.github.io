// Existing feature tests continue past the new startup reminder. Folder lifecycle
// tests exercise the dialog directly and intentionally do not use this helper.
exports.dismissFolderPrompt=async page=>{
 await page.waitForFunction(()=>document.documentElement.dataset.studioReady==='true');
 const dialog=page.locator('#folder-setup-dialog');
 if(await dialog.evaluate(node=>node.open))await dialog.locator('[data-close]').last().click();
};
