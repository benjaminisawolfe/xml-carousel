# James Clark xmltest history audit

Task 13.19 performed this read-only audit without applying the preserved stash
or rewriting any ref.

## Current-tree remediation

The formerly tracked paths were:

```text
tests/fixtures/w3c-xmlconf-20130923/ci-corpus/xmltest/invalid/not-sa/022.xml
tests/fixtures/w3c-xmlconf-20130923/ci-corpus/xmltest/invalid/not-sa/022.ent
```

Both are removed from the current worktree. The selected case reads byte-identical
entries from the unchanged `xmltest.zip` instead.

## Repository migration completion

On 2026-08-05, the historical repository was renamed to
`benjaminisawolfe/xml-carousel-history-private`, made private, and archived.
The replacement public `benjaminisawolfe/xml-carousel` repository began at the
parentless clean root commit
`c87854ecd922ca916a6f28c176281c10a6af0970`, whose tree is
`49b5d2b61b38bccaac436dccab95a45900972759`. No historical branch, tag, commit,
stash, pull-request ref, unreachable object, or forbidden blob was copied.

Anonymous web and API requests could not retrieve the introducing commit, the
two historical blobs, or the former integrated commit from the replacement
public repository. The private archive was also anonymous-inaccessible. A
fresh anonymous clone contained one commit, passed `git fsck`, and contained
none of those objects. The unchanged 107,060-byte `xmltest.zip` is the only
redistributed form of the James Clark collection in the public tree.

XML Carousel remains hosted and deployed separately by FTP. The repository
migration did not use GitHub Pages or migrate the website.

## Commit and blob identities

Both paths were introduced, and never subsequently changed, by:

```text
70917bef925c7e86a31b2b2802dea0f68907d5f3
Expand conformance and Hermetic regression coverage
```

Historical blob IDs:

```text
022.xml  b639f2551cccbc2a4b6264e1c199dd236c943185
022.ent  26f2d8beb2acdf8d2a062831ce2790f449e33f69
```

## Historical refs retained privately

The following refs were identified by the Task 13.19 audit and remain preserved
only in the private, read-only historical archive.

Local branches:

```text
main
task-13.9-expanded-conformance-hermetic-regression
task-13.10-complete-visualization-coverage-audit
task-13.11-complete-dtd-visualization
task-13.12-complete-xsd-structural-visualization
task-13.13-complete-xsd-type-system-constraint-visualization
task-13.14-complete-xsd-relationship-schema-set-visualization
task-13.15-annotation-appinfo-foreign-source-completeness
task-13.16-complete-zip-multi-file-presentation
task-13.17-visualization-ux-reachability-audit
task-13.18-complete-visualization-acceptance-gate
task-13.19-final-standards-licensing-documentation
```

Remote-tracking refs:

```text
origin/HEAD
origin/main
origin/task-13.9-expanded-conformance-hermetic-regression
origin/task-13.10-complete-visualization-coverage-audit
origin/task-13.11-complete-dtd-visualization
origin/task-13.12-complete-xsd-structural-visualization
origin/task-13.13-complete-xsd-type-system-constraint-visualization
origin/task-13.14-complete-xsd-relationship-schema-set-visualization
origin/task-13.15-annotation-appinfo-foreign-source-completeness
origin/task-13.16-complete-zip-multi-file-presentation
origin/task-13.17-visualization-ux-reachability-audit
origin/task-13.18-complete-visualization-acceptance-gate
```

Local Codex refs:

```text
refs/codex/turn-diffs/captures/1785869996839/21214f0c-044f-42b4-b640-c594cd59620e/base
refs/codex/turn-diffs/checkpoints/4e419aead0e3f109adaad36cce5ce30add1198e44bff1e16df48899e9ff596f4/145e60eaeacab88ceac0177ef51c8deb5eb773b6ccc34203f4c46d1c951c8021/1785868956259/590b411d-64bc-4b98-87fc-7c2f4c58d31d
```

No tag exists. The preserved stash
`0cf043aed417074936c9cc08bb2af29435c1ebb3` does not contain either path.

At the cutover gates, GitHub reported zero known forks, zero releases, and zero
downloadable Actions artifacts for both repository identities. The workflow
does not upload artifacts. These facts do not prove that no third party cloned
or cached the formerly public history.

## Conclusion

The Task 13.19 finding was **Unresolved historical redistribution**: deleting
the paths in the current tree did not remove their blobs from then-public
history or retained branches. The clean-repository migration resolved that
finding for GitHub repositories under Ben's control. The historical objects
remain preserved only in the private archived repository, while the public
repository has independent clean history.

The migration performed no history rewrite, filter operation, mirror push,
force-push, historical branch deletion, tag deletion, or release operation.
Independent third-party caches or clones may still exist outside Ben's
control.

Audit commands included `git log --all -- <paths>`, `git rev-parse
HEAD:<path>`, `git for-each-ref`, `git cat-file -e <ref>:<path>`, `git tag
--list`, stash tree inspection, GitHub repository/release queries, and the
Actions artifact API.
