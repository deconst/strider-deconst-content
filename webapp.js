module.exports = {
  config: {
    contentServiceURL: {
      type: String
    },
    contentServiceAPIKey: {
      type: String
    },
    contentServiceTLSVerify: {
      type: Boolean,
      default: true
    },
    stagingContentServiceURL: {
      type: String
    },
    stagingContentServiceAdminAPIKey: {
      type: String
    },
    verbose: {
      type: Boolean,
      default: false
    }
  }
};
