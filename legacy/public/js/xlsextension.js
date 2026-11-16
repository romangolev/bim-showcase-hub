class XLSExtension extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
      super(viewer, options);
      this._group = null;
      this._button = null;
  }

  load() {
      console.log('XLSExtension has been loaded');
      return true;
  }

  unload() {
      // Clean our UI elements if we added any
      if (this._group) {
          this._group.removeControl(this._button);
          if (this._group.getNumberOfControls() === 0) {
              this.viewer.toolbar.removeControl(this._group);
          }
      }
      console.log('XLSExtension has been unloaded');
      return true;
  }

  onToolbarCreated() {
      // Create a new toolbar group if it doesn't exist
      this._group = this.viewer.toolbar.getControl('allMyAwesomeExtensionsToolbar');
      if (!this._group) {
          this._group = new Autodesk.Viewing.UI.ControlGroup('allMyAwesomeExtensionsToolbar');
          this.viewer.toolbar.addControl(this._group);
      }

      // Add a new button to the toolbar group
      this._button = new Autodesk.Viewing.UI.Button('XLSExtensionButton');
      this._button.onClick = async function (e) {
        function statusCallback(completed, message) {
          $.notify(message, { className: "info", position:"bottom right" });
          $('#downloadExcel').prop("disabled", !completed);
        }
        ForgeXLS.downloadXLSX(fileName.replace(/\./g, '') + ".xlsx", statusCallback);

      };
      this._button.setToolTip('Export to .XLSX');
      this._button.addClass('toolbarXLSButton');
      this._group.addControl(this._button);
  }
}

Autodesk.Viewing.theExtensionManager.registerExtension('Autodesk.Sample.XLSExtension', XLSExtension);