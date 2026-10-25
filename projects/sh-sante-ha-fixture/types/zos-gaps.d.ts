// Exports used by the official zeus 1.9.3 OS 4.0 templates but missing from
// @zeppos/device-types 4.0.0.
declare module "@zos/ui" {
  function deleteWidget(widget: any): void;
  function setStatusBarVisible(visible: boolean): void;
}
