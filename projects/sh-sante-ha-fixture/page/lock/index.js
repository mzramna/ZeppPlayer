import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { COLOR, CX, DOMAINS, FONT, MARGIN, W } from "../../utils/theme.js";
import { actionButton, createTracked, formatState, title } from "../../utils/ui.js";
import { entityPage } from "../../utils/entity-page.js";

Page(
  entityPage({
    domain: "lock",
    draw(e, list) {
      const locked = e.state === "locked";
      const armed = locked && this.isArmed("unlock");
      title(list, e.name);

      createTracked(list, hmUI.widget.TEXT, {
        x: MARGIN, y: 112, w: W - MARGIN * 2, h: 80,
        text: formatState(e), text_size: FONT.big, color: COLOR.text,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
      });

      // Unlocking takes two taps; locking goes straight through.
      let text = getText(locked ? "unlock_action" : "lock_action");
      if (armed) text = getText("tap_again_to_confirm");
      actionButton(list, {
        x: CX - 160, y: 224, w: 320, h: 96, text,
        color: armed ? COLOR.danger : DOMAINS.lock.color,
        onClick: () => {
          if (!locked) this.act("lock");
          else if (this.confirm("unlock")) this.act("unlock");
        },
      });
    },
  })
);
