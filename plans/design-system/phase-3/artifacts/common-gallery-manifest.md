# Common gallery manifest

| Owner   | Fixture state                                           | Interaction coverage                                                                   | Viewports and snapshots                              | Expected difference                                                       |
| ------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| DS-0302 | ConfirmDialog opened from `Delete specialist`           | safe initial focus, blocked outside dismissal, Escape, focus return                    | interactive desktop; existing dialog baselines       | AlertDialog semantics and CC Button styling replace custom modal behavior |
| DS-0303 | Document and folder dialogs opened from real triggers   | initial field focus, Escape/outside dismissal, focus return                            | 1280; document open at 320                           | Radix ordinary-dialog behavior with unchanged document form content       |
| DS-0304 | PageHeader plus loading, error, and empty sections      | public composition rendering                                                           | common light/dark at 1280 and 390                    | shared Surface/Alert ownership with equivalent semantic-token appearance  |
| DS-0305 | enabled and disabled password fields                    | reveal toggle and disabled state                                                       | common light/dark at 1280 and 390                    | CC Input/Button composition and focus treatment                           |
| DS-0306 | checked and disabled switches                           | Space and Enter activation                                                             | common light/dark at 1280 and 390                    | semantic switch track/thumb replaces raw color utilities                  |
| DS-0307 | icon and text tabs with related panel                   | arrows, Home, End, automatic activation                                                | common light/dark at 1280 and 390                    | Radix tab semantics and focus management                                  |
| DS-0308 | selected, disabled, filtered, and open SearchableSelect | focus open, label/ID filtering, arrows, Enter, Escape, outside dismissal, focus return | common light/dark at 1280 and 390; open popup at 320 | portalled, collision-aware CC Popover/Command composition                 |

The common closed-state snapshots are `common-{light,dark}-{desktop,mobile}`.
The narrow open-state snapshots are `common-select-light-narrow` and
`common-document-light-narrow`. All examples use public component APIs and the
Default theme. Existing primitive, application, semantic, Markdown, and
Milkdown surfaces remain separate fixtures.
