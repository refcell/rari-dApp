import React from "react";

import { Column } from "buttered-chakra";
// import Footer from "./Footer";

const Layout = ({ children }: { children: any }) => {
  return (
    <>
      <Column
        mainAxisAlignment="center"
        crossAxisAlignment="center"
        height="100%"
        flex={1}
      >
        {children}
        {/* <Footer /> */}
      </Column>
    </>
  );
};

export default Layout;