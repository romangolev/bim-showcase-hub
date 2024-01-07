/* global THREE */
class PaintBrushes extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this._group = null;
        this._button = null;
    }

    load() {
        console.log('PaintBrushes has been loaded');
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
        console.log('PaintBrushes has been unloaded');
        return true;
    }

    _removeColors() {
        this.viewer.clearThemingColors();
    }

    _applyColors(sel, color) {
        const viewer = this.viewer;
        for (const id of sel) {
            viewer.setThemingColor(id, color);
        }
    }

    onToolbarCreated() {
        // Create a new toolbar group if it doesn't exist
        this._group = this.viewer.toolbar.getControl('allMyAwesomeExtensionsToolbar');
        if (!this._group) {
            this._group = new Autodesk.Viewing.UI.ControlGroup('allMyAwesomeExtensionsToolbar');
            this.viewer.toolbar.addControl(this._group);
        }

        this._comboButton = new Autodesk.Viewing.UI.ComboButton('PaintBrushes');
        // Add a new button to the toolbar group
        this._buttonRed = new Autodesk.Viewing.UI.Button('PaintRed');
        this._buttonBlue = new Autodesk.Viewing.UI.Button('PaintBlue');
        this._buttonGreen = new Autodesk.Viewing.UI.Button('PaintGreen');
        this._buttonReset = new Autodesk.Viewing.UI.Button('ResetPaint');

        // define colors
        const colorRed = new THREE.Vector4(1.0, 0.0, 0.0, 0.5);
        const colorGreen = new THREE.Vector4(0.0, 1.0, 0.0, 0.5);
        const colorBlue = new THREE.Vector4(0.0, 0.0, 1.0, 0.5);

        this._buttonRed.onClick = () => {
            // Get current selection
            const selection = this.viewer.getSelection();
            this.viewer.clearSelection();            
            if (selection.length > 0) {
                this._applyColors(selection, colorRed);
            } else { 0 }
        };
        this._buttonGreen.onClick = () => {
            // Get current selection
            const selection = this.viewer.getSelection();
            this.viewer.clearSelection();            
            if (selection.length > 0) {
                this._applyColors(selection, colorGreen);
            } else { 0 }
        };
        this._buttonBlue.onClick = () => {
            // Get current selection
            const selection = this.viewer.getSelection();
            this.viewer.clearSelection();            
            if (selection.length > 0) {
                this._applyColors(selection, colorBlue);
            } else { 0 }
        };
        this._buttonReset.onClick = () => {
            this._removeColors();
        };
        this._buttonRed.setToolTip('Paint selected items in Red');
        this._buttonRed.addClass('paintBrushRedIcon');
        this._buttonBlue.setToolTip('Paint selected items in Blue');
        this._buttonBlue.addClass('paintBrushBlueIcon'); 
        this._buttonGreen.setToolTip('Paint selected items in Green');
        this._buttonGreen.addClass('paintBrushGreenIcon'); 
        this._buttonReset.setToolTip('Reset appearance');
        this._buttonReset.addClass('paintBrushResetIcon');
        this._comboButton.setToolTip('Paint tools');
        this._comboButton.addClass('paintComboIcon');
        
        this._group.addControl(this._comboButton);
        this._comboButton.addControl(this._buttonReset);
        this._comboButton.addControl(this._buttonRed);
        this._comboButton.addControl(this._buttonBlue);
        this._comboButton.addControl(this._buttonGreen);

    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('PaintBrushes', PaintBrushes);
