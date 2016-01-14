# Content Repository Builder for Strider CD

Job plugin for [Strider CD](https://github.com/Strider-CD/strider) that:

 1. Walks the workspace directory for `_deconst.json` files to identify preparable Deconst content.
 2. Identifies the correct preparer. This can be stated explicitly in `_deconst.json` or inferred from the other files in the same directory.
 3. Configures and invokes the preparer as a Docker container.
 4. Reports a successful completion if at least one preparer is launched and if all preparers completed successfully.

The build can be used as a stand-alone tool from the command line or as a build plugin within Strider.

```bash
npm install -g strider-deconst-content

cd ${CONTENT_REPO}
deconst-content-build
```
