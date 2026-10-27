import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { COLOR, CX, DOMAINS, FONT, MARGIN, W } from "../../utils/theme.js";
import { actionButton, createTracked, formatState, title } from "../../utils/ui.js";
import { entityPage } from "../../utils/entity-page.js";
import { alarmPolicy } from "../../utils/controls.js";

Page(
  entityPage({
    domain: "alarm_control_panel",
    draw(e, list) {
      const policy = alarmPolicy(e.attributes);
      title(list, e.name);

      createTracked(list, hmUI.widget.TEXT, {
        x: MARGIN, y: 80, w: W - MARGIN * 2, h: 40,
        text: formatState(e), text_size: FONT.body, color: COLOR.text,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
      });
      if (policy.needsCode) {
        createTracked(list, hmUI.widget.TEXT, {
          x: MARGIN, y: 120, w: W - MARGIN * 2, h: 32,
          text: getText("alarm_code_required"), text_size: FONT.small, color: COLOR.textDim,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        });
      }

      const buttons = [];
      if (policy.canArm) {
        buttons.push({ text: getText("arm_home"), onClick: () => this.act("alarm_arm_home") });
        buttons.push({ text: getText("arm_away"), onClick: () => this.act("alarm_arm_away") });
      }
      if (policy.canDisarm) {
        // Disarming takes two taps, like unlocking a lock.
        const armed = this.isArmed("disarm");
        buttons.push({
          text: getText(armed ? "tap_again_to_confirm" : "disarm"),
          color: armed ? COLOR.danger : COLOR.card,
          onClick: () => {
            if (this.confirm("disarm")) this.act("alarm_disarm");
          },
        });
      }
      buttons.forEach((b, i) =>
        actionButton(list, { x: CX - 140, y: 168 + i * 76, w: 280, h: 64, color: DOMAINS.alarm_control_panel.color, ...b })
      );
    },
  })
);
