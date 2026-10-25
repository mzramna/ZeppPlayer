import { gettext } from 'i18n'

AppSettingsPage({
  state: {
    entityList: [],
    props: {},
  },
  setState(props) {
    this.state.props = props;
    if (props.settingsStorage.getItem("entityList")) {
      try {
        this.state.entityList = JSON.parse(
          props.settingsStorage.getItem("entityList")
        );
      } catch (e) {
        this.state.entityList = [];
      }
    } else {
      this.state.entityList = [];
    }
  },
  setItem() {
    const newStr = JSON.stringify(this.state.entityList);
    this.state.props.settingsStorage.setItem("entityList", newStr);
  },
  getFavorites() {
    const raw = this.state.props.settingsStorage.getItem("favorites");
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      } catch (_) {}
    }
    // Fallback: collect from entityList items where favorite === true
    const favs = this.state.entityList
      .filter((it) => it && it.favorite)
      .map((it) => it.key);
    return favs;
  },
  saveFavorites(favList) {
    this.state.props.settingsStorage.setItem("favorites", JSON.stringify(favList));
  },
  toggleEntity(key, val) {
    this.state.entityList = this.state.entityList.map((item) => {
      if (item.key === key) {
        item.value = val;
      }
      return item;
    });
    this.setItem();
  },
  toggleFavorite(key, val) {
    let favs = this.getFavorites();
    if (val) {
      if (!favs.includes(key)) {
        favs.push(key);
      }
    } else {
      favs = favs.filter((k) => k !== key);
    }
    this.saveFavorites(favs);

    this.state.entityList = this.state.entityList.map((item) => {
      if (item.key === key) {
        item.favorite = val;
        if (val) item.value = true; // Auto-enable when favorited
      }
      return item;
    });
    this.setItem();
  },
  moveFavorite(fromIdx, toIdx) {
    const favs = [...this.getFavorites()];
    if (toIdx < 0 || toIdx >= favs.length) return;
    const [moved] = favs.splice(fromIdx, 1);
    favs.splice(toIdx, 0, moved);
    this.saveFavorites(favs);
  },
  removeFavorite(key) {
    const favs = this.getFavorites().filter((k) => k !== key);
    this.saveFavorites(favs);
    this.state.entityList = this.state.entityList.map((item) => {
      if (item.key === key) {
        item.favorite = false;
      }
      return item;
    });
    this.setItem();
  },
  moveEntityToTop(key) {
    const idx = this.state.entityList.findIndex((it) => it.key === key);
    if (idx <= 0) return;
    const [entity] = this.state.entityList.splice(idx, 1);
    this.state.entityList.unshift(entity);
    this.setItem();
  },
  build(props) {
    this.setState(props);

    const isDark = props.settingsStorage.getItem("darkMode") !== "false";
    const theme = isDark
      ? {
          bg: "#0f172a",
          cardBg: "#1e293b",
          cardBorder: "#334155",
          textPrimary: "#f8fafc",
          textSecondary: "#94a3b8",
          inputBg: "#0f172a",
          inputBorder: "#334155",
          inputText: "#f8fafc",
          itemBorder: "#334155",
          primaryBtn: "#0284c7",
          successBtn: "#10b981",
          dangerBtn: "#ef4444",
          neutralBtn: "#475569",
          btnText: "#ffffff",
          favColor: "#fbbf24",
        }
      : {
          bg: "#f1f5f9",
          cardBg: "#ffffff",
          cardBorder: "#e2e8f0",
          textPrimary: "#0f172a",
          textSecondary: "#64748b",
          inputBg: "#ffffff",
          inputBorder: "#cbd5e1",
          inputText: "#0f172a",
          itemBorder: "#f1f5f9",
          primaryBtn: "#0284c7",
          successBtn: "#10b981",
          dangerBtn: "#ef4444",
          neutralBtn: "#94a3b8",
          btnText: "#ffffff",
          favColor: "#d97706",
        };

    const cardStyle = {
      backgroundColor: theme.cardBg,
      borderRadius: "14px",
      padding: "16px",
      marginBottom: "16px",
      border: `1px solid ${theme.cardBorder}`,
    };

    const sectionTitleStyle = {
      fontSize: "17px",
      fontWeight: "bold",
      color: theme.textPrimary,
      marginBottom: "10px",
    };

    const labelStyle = {
      fontSize: "14px",
      fontWeight: "600",
      color: theme.textPrimary,
      marginTop: "8px",
      marginBottom: "4px",
    };

    const hintStyle = {
      fontSize: "12px",
      fontStyle: "italic",
      color: theme.textSecondary,
      marginBottom: "6px",
    };

    const textInputStyle = {
      backgroundColor: theme.inputBg,
      color: theme.inputText,
      fontSize: "14px",
      border: `1px solid ${theme.inputBorder}`,
      borderRadius: "10px",
      height: "40px",
      padding: "8px 12px",
      marginBottom: "10px",
      width: "100%",
      boxSizing: "border-box",
    };

    const pillBtnStyle = (bg, color = theme.btnText) => ({
      backgroundColor: bg,
      color: color,
      borderRadius: "20px",
      fontSize: "13px",
      fontWeight: "600",
      height: "32px",
      lineHeight: "32px",
      textAlign: "center",
      padding: "0 14px",
      border: "none",
      cursor: "pointer",
    });

    const favorites = this.getFavorites();

    // 1. Header Card with Title and Dark Theme Toggle
    const headerCard = View({ style: cardStyle }, [
      View({
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }
      }, [
        Text({
          style: {
            fontSize: "20px",
            fontWeight: "bold",
            color: theme.textPrimary,
          }
        }, "Home Assistant"),
        Toggle({
          label: gettext('DarkMode'),
          value: isDark,
          onChange: (val) => {
            props.settingsStorage.setItem("darkMode", val ? "true" : "false");
          },
        }),
      ]),
    ]);

    // 2. Access Card
    const accessCard = View({ style: cardStyle }, [
      Text({ style: sectionTitleStyle }, gettext('Access')),

      Text({ style: labelStyle }, gettext('IPLocal')),
      Text({ style: hintStyle }, "e.g. http://homeassistant.local:8123/"),
      TextInput({
        settingsKey: "localHAIP",
        subStyle: textInputStyle,
      }),

      Text({ style: labelStyle }, gettext('IPExternal')),
      Text({ style: hintStyle }, "e.g. https://aguacatec.es/"),
      TextInput({
        settingsKey: "externalHAIP",
        subStyle: textInputStyle,
      }),

      Text({ style: labelStyle }, gettext('LongToken')),
      Text({ style: hintStyle }, gettext('FromProfile')),
      TextInput({
        settingsKey: "HAToken",
        subStyle: textInputStyle,
      }),

      View({
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "8px",
          marginTop: "6px",
          borderTop: `1px solid ${theme.itemBorder}`,
        }
      }, [
        View({ style: { flex: 1, paddingRight: "10px" } }, [
          Text({ style: { fontSize: "14px", fontWeight: "600", color: theme.textPrimary } }, gettext('UpdateSensor')),
          Text({ style: hintStyle }, gettext('WorksBetter')),
        ]),
        Toggle({
          value: (props.settingsStorage.getItem("updateSensorsBool") === "true"),
          onChange: (value) => {
            props.settingsStorage.setItem("updateSensorsBool", String(value));
          },
        }),
      ]),
    ]);

    // 3. Favorites Section (Quick-Access)
    let favoriteRows = [];
    if (favorites.length === 0) {
      favoriteRows.push(
        Text({
          style: {
            fontSize: "13px",
            color: theme.textSecondary,
            fontStyle: "italic",
            padding: "8px 0",
          }
        }, gettext('NoFavorites'))
      );
    } else {
      favorites.forEach((favKey, idx) => {
        const entity = this.state.entityList.find((it) => it.key === favKey) || {
          key: favKey,
          title: favKey,
        };
        favoriteRows.push(
          View({
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: `1px solid ${theme.itemBorder}`,
            }
          }, [
            View({ style: { flex: 1, paddingRight: "8px" } }, [
              Text({
                style: {
                  fontSize: "14px",
                  fontWeight: "600",
                  color: theme.textPrimary,
                }
              }, `★ ${entity.title}`),
              Text({
                style: {
                  fontSize: "12px",
                  color: theme.textSecondary,
                }
              }, entity.key),
            ]),
            View({
              style: {
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
              }
            }, [
              idx > 0 &&
                Button({
                  label: "↑",
                  style: {
                    ...pillBtnStyle(theme.neutralBtn),
                    minWidth: "30px",
                    padding: "0 6px",
                    height: "26px",
                    lineHeight: "26px",
                    marginRight: "4px",
                  },
                  onClick: () => this.moveFavorite(idx, idx - 1),
                }),
              idx < favorites.length - 1 &&
                Button({
                  label: "↓",
                  style: {
                    ...pillBtnStyle(theme.neutralBtn),
                    minWidth: "30px",
                    padding: "0 6px",
                    height: "26px",
                    lineHeight: "26px",
                    marginRight: "4px",
                  },
                  onClick: () => this.moveFavorite(idx, idx + 1),
                }),
              Button({
                label: gettext('Remove'),
                style: {
                  ...pillBtnStyle(theme.dangerBtn),
                  height: "26px",
                  lineHeight: "26px",
                  padding: "0 10px",
                  fontSize: "12px",
                },
                onClick: () => this.removeFavorite(favKey),
              }),
            ]),
          ])
        );
      });
    }

    const favoritesCard = View({ style: cardStyle }, [
      Text({ style: sectionTitleStyle }, gettext('Favorites')),
      ...favoriteRows,
    ]);

    // 4. Paginated Entities Section
    const filter = (props.settingsStorage.getItem("filter") || "").toLowerCase().trim();
    const filteredEntities = this.state.entityList.filter((item) => {
      if (!item || !item.key) return false;
      const validDomain = (
        item.key.startsWith('light.') ||
        item.key.startsWith('switch.') ||
        item.key.startsWith('input_boolean.') ||
        item.key.startsWith('binary_sensor.') ||
        item.key.startsWith('sensor.') ||
        item.key.startsWith('media_player.') ||
        item.key.startsWith('script.') ||
        item.key.startsWith('automation.')
      );
      if (!validDomain) return false;
      if (filter) {
        const matchesKey = item.key.toLowerCase().includes(filter);
        const matchesTitle = item.title && item.title.toLowerCase().includes(filter);
        return matchesKey || matchesTitle;
      }
      return true;
    });

    const PAGE_SIZE = 20;
    const totalPages = Math.ceil(filteredEntities.length / PAGE_SIZE) || 1;
    let pageRaw = props.settingsStorage.getItem("entityPage");
    let currentPage = parseInt(pageRaw, 10);
    if (isNaN(currentPage) || currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageEntities = filteredEntities.slice(startIdx, startIdx + PAGE_SIZE);

    let entityRows = [];
    pageEntities.forEach((item) => {
      const isFav = favorites.includes(item.key) || !!item.favorite;
      entityRows.push(
        View({
          style: {
            display: "flex",
            flexDirection: "column",
            padding: "10px 0",
            borderBottom: `1px solid ${theme.itemBorder}`,
          }
        }, [
          View({
            style: {
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "4px",
            }
          }, [
            View({ style: { flex: 1, paddingRight: "10px" } }, [
              Toggle({
                label: `${item.title} (${item.key})`,
                value: !!item.value,
                onChange: (val) => this.toggleEntity(item.key, val),
              }),
            ]),
          ]),
          View({
            style: {
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingLeft: "8px",
            }
          }, [
            Toggle({
              label: `★ ${gettext('Favorite')}`,
              value: isFav,
              onChange: (val) => this.toggleFavorite(item.key, val),
            }),
            Button({
              label: gettext('Top'),
              style: {
                ...pillBtnStyle(theme.successBtn, "#000000"),
                height: "26px",
                lineHeight: "26px",
                fontSize: "12px",
                padding: "0 12px",
              },
              onClick: () => this.moveEntityToTop(item.key),
            }),
          ]),
        ])
      );
    });

    const paginationControls = totalPages > 1
      ? View({
          style: {
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 0 6px 0",
          }
        }, [
          Button({
            label: `◀ ${gettext('Prev')}`,
            style: {
              ...pillBtnStyle(currentPage > 1 ? theme.primaryBtn : theme.neutralBtn),
              opacity: currentPage > 1 ? "1" : "0.5",
              height: "32px",
              lineHeight: "32px",
              fontSize: "13px",
            },
            onClick: () => {
              if (currentPage > 1) {
                props.settingsStorage.setItem("entityPage", String(currentPage - 1));
              }
            },
          }),
          Text({
            style: {
              fontSize: "13px",
              fontWeight: "600",
              color: theme.textSecondary,
            }
          }, `${gettext('Page')} ${currentPage} / ${totalPages} (${filteredEntities.length})`),
          Button({
            label: `${gettext('Next')} ▶`,
            style: {
              ...pillBtnStyle(currentPage < totalPages ? theme.primaryBtn : theme.neutralBtn),
              opacity: currentPage < totalPages ? "1" : "0.5",
              height: "32px",
              lineHeight: "32px",
              fontSize: "13px",
            },
            onClick: () => {
              if (currentPage < totalPages) {
                props.settingsStorage.setItem("entityPage", String(currentPage + 1));
              }
            },
          }),
        ])
      : null;

    const entitiesCard = View({ style: cardStyle }, [
      Text({ style: sectionTitleStyle }, gettext('Entities')),
      Text({ style: labelStyle }, gettext('SearchEntities')),
      Text({ style: hintStyle }, gettext('SearchEntitiesEG')),

      View({
        style: {
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
        }
      }, [
        View({ style: { flex: 1 } }, [
          TextInput({
            settingsKey: "filter",
            subStyle: {
              ...textInputStyle,
              marginBottom: "0px",
            },
          }),
        ]),
        Button({
          label: gettext('Search'),
          style: {
            ...pillBtnStyle(theme.primaryBtn),
            height: "40px",
            lineHeight: "40px",
            padding: "0 16px",
          },
          async onClick() {
            props.settingsStorage.removeItem("entityList");
            props.settingsStorage.setItem("entityPage", "1");
            props.settingsStorage.setItem("listFetchRandom", String(Math.random()));
          },
        }),
      ]),

      paginationControls,
      ...entityRows,
      paginationControls,
    ]);

    return Section({
      style: {
        backgroundColor: theme.bg,
        minHeight: "100%",
        padding: "12px",
      }
    }, [
      headerCard,
      accessCard,
      favoritesCard,
      entitiesCard,
    ]);
  },
});
