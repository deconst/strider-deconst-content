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
    verbose: {
      type: Boolean,
      default: false
    }
  }
};
