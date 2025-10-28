import React from 'react';
import { Outlet } from 'react-router-dom';
import SideBar from './SideBar';
import NavBar from './NavBar';

const Layout = () => {
  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      <SideBar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <NavBar />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;

