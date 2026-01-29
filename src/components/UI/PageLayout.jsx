import React, { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

export default function PageLayout({ title, tabs, renderBottomTabs = false }) {
    const location = useLocation();

    const { prevTab, nextTab } = useMemo(() => {
        if (!tabs || tabs.length === 0) return { prevTab: null, nextTab: null };
        const idx = tabs.findIndex((tab) => {
            const target = tab.to || '';
            if (tab.end) {
                return location.pathname === (target.startsWith('/') ? target : `/${target}`) || location.pathname === target;
            }
            return location.pathname.startsWith(target.startsWith('/') ? target : `/${target}`) || location.pathname.startsWith(target);
        });
        if (idx === -1) return { prevTab: null, nextTab: null };
        const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
        const next = tabs[(idx + 1) % tabs.length];
        return { prevTab: prev, nextTab: next };
    }, [location.pathname, tabs]);

    return (
        <div className="page-fullscreen">
            <div className="page-content-full">
                <Outlet />
            </div>

            {renderBottomTabs && tabs && tabs.length > 0 && (
                <div className="compendium-tabbar-wrapper">
                    <nav className="compendium-tabbar" aria-label={`${title} pages`}>
                        {prevTab && (
                            <NavLink
                                to={prevTab.to}
                                end={prevTab.end}
                                className={({ isActive }) =>
                                    `compendium-tab compendium-tab__arrow ${isActive ? 'compendium-tab--active' : ''}`
                                }
                            >
                                ‹ {prevTab.label}
                            </NavLink>
                        )}
                        <div className="compendium-tabbar__list">
                            {tabs.map((tab) => (
                                <NavLink
                                    key={tab.to}
                                    to={tab.to}
                                    end={tab.end}
                                    className={({ isActive }) =>
                                        `compendium-tab ${isActive ? 'compendium-tab--active' : ''}`
                                    }
                                >
                                    {tab.label}
                                </NavLink>
                            ))}
                        </div>
                        {nextTab && (
                            <NavLink
                                to={nextTab.to}
                                end={nextTab.end}
                                className={({ isActive }) =>
                                    `compendium-tab compendium-tab__arrow ${isActive ? 'compendium-tab--active' : ''}`
                                }
                            >
                                {nextTab.label} ›
                            </NavLink>
                        )}
                    </nav>
                </div>
            )}
        </div>
    );
}
