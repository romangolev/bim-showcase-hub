class DashboardHandler extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this._group = null;
        this._button = null;
    }

    load() {
        console.log('DashboardHandler has been loaded');
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
        console.log('DashboardHandler has been unloaded');
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
        this._button = new Autodesk.Viewing.UI.Button('DashboardHandlerButton');
        this._button.onClick = (ev) => {
            //alert('You are using RHI hub web application!')
            // Execute an action here
            console.log($("#one"));

            var path = window.location.pathname;
            var page = path.split("/").pop();
            //console.log(page);
            if (document.getElementById("dashboard").style.display === "none"){
                document.getElementById("dashboard").style.display = "";
                viewer.resize();
            } else {
                document.getElementById("dashboard").style.display = "none";
                viewer.resize();
            }
        };
        this._button.setToolTip('Hide/Show Dashboard');
        this._button.addClass('myAwesomeExtensionIcon');
        this._group.addControl(this._button);
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('DashboardHandler', DashboardHandler);
