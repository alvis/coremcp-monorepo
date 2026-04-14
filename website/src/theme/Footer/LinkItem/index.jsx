import React from 'react';
import clsx from 'clsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowUpRightFromSquare,
  faCodeBranch,
} from '@fortawesome/pro-duotone-svg-icons';
import LinkItem from '@theme-original/Footer/LinkItem';

export default function FooterLinkItemWrapper(props) {
  const href = props.href ?? '';

  if (href.includes('github.com')) {
    return (
      <LinkItem
        {...props}
        className={clsx(props.className, 'footerGithubLink')}
        label={
          <span className="footerGithubLabel">
            <FontAwesomeIcon icon={faCodeBranch} />
            <span>GitHub</span>
            <FontAwesomeIcon
              icon={faArrowUpRightFromSquare}
              className="footerGithubMeta"
            />
          </span>
        }
      />
    );
  }

  return <LinkItem {...props} />;
}
