const { withEntitlementsPlist } = require('@expo/config-plugins');

// Personal Apple Developer teams don't support Push Notifications capability.
// This plugin removes the aps-environment entitlement that expo-notifications
// injects automatically, so builds work without a paid developer account.
// Remove this plugin when enrolling in the Apple Developer Program.
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
};
