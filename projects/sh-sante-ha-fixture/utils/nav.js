import { push } from "@zos/router";
import { getText } from "@zos/i18n";
import { METHOD } from "../shared/protocol.js";
import { toast } from "./ui.js";
import { tapAction } from "./groups.js";

// Tap on an entity row: open its page, or run its service in place and refresh it.
// onDone(entity) gets the entity as it is now (the old one when the refresh failed).
export function runTap(page, entity, onDone) {
  const action = tapAction(entity);
  if (!action) return;
  const alive = () => page.state.alive;
  if (action.page) {
    push({ url: action.page, params: JSON.stringify({ entity_id: entity.entity_id }) });
    return;
  }
  page
    .request({
      method: METHOD.CALL_SERVICE,
      params: { domain: action.domain, service: action.service, entity_id: entity.entity_id },
    })
    .then(
      () => {
        if (!alive()) return;
        toast(getText("done"));
        // A failed refresh must not read as a failed action: keep the old state.
        return page
          .request({ method: METHOD.GET_ENTITY, params: { entity_id: entity.entity_id } })
          .catch(() => entity)
          .then((fresh) => {
            if (alive()) onDone(fresh);
          });
      },
      () => {
        if (alive()) toast(getText("action_failed"));
      }
    );
}
