import React from 'react';
import clsx from 'clsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowUpRightFromSquare,
  faCodeBranch,
} from '@fortawesome/pro-duotone-svg-icons';
import DefaultNavbarItem from '@theme-original/NavbarItem/DefaultNavbarItem';

export default function DefaultNavbarItemWrapper(props) {
  const href = props.href ?? '';

  if (href.includes('github.com')) {
    return (
      <DefaultNavbarItem
        {...props}
        className={clsx(props.className, 'navbar__icon-link')}
        label={
          <span className="navbarIconLabel">
            <FontAwesomeIcon icon={faCodeBranch} />
            <span className="navbarIconText">GitHub</span>
            <FontAwesomeIcon
              icon={faArrowUpRightFromSquare}
              className="navbarIconMeta"
            />
          </span>
        }
      />
    );
  }

  return <DefaultNavbarItem {...props} />;
}
