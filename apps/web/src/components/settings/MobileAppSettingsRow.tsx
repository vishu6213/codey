import { AndroidIcon, AppleIcon } from "../Icons";
import { Button } from "../ui/button";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function MobileAppSettingsRow() {
  return (
    <SettingsRow
      {...searchableSetting("mobile-app")}
      description="Connect to your Codey workspace from your phone or tablet. (Coming soon for iOS & Android)"
      control={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="opacity-70 cursor-default" title="Coming soon">
            <AppleIcon />
            iPhone & iPad
          </Button>
          <Button size="sm" variant="outline" className="opacity-70 cursor-default" title="Coming soon">
            <AndroidIcon />
            Android
          </Button>
        </div>
      }
    />
  );
}
