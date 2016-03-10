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
    stagingPresenterURL: {
      type: String
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
